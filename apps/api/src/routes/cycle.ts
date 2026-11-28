import { ORPCError } from "@orpc/server";
import { DB, type tables } from "@smelp/db";
import { eventBus } from "@smelp/events";
import { SQL } from "bun";
import * as v from "valibot";
import { requireProjectPermission, requireUser } from "../lib/access";
import { Day } from "../lib/day";
import { base } from "../orpc";

const sql = new DB().sqlite;

/*
  Cycles are time-boxed iterations of one project. Rules:
  - Dates are whole days (YYYY-MM-DD); the end is on or after the start.
  - A project's cycles never overlap, not even on a single day. The API refuses
    a cycle that would, in the same statement that writes it.
  - Status comes from the dates, by today's date in UTC: upcoming, current, completed.
  - A completed cycle's velocity is frozen the first time it is read with items
    in it, or before its unfinished items move on, so later edits don't rewrite it.
  - Creating, editing and deleting cycles needs what project states need
    ("space:update", i.e. project admins). Putting items in cycles, and moving a
    cycle's unfinished items on, is ordinary work item editing ("content:write").
    Guests and archived projects are read-only.
*/

// An empty id would be stored as-is and skip the checks that guard real ones.
const NonEmpty = v.pipe(v.string(), v.minLength(1));
const Name = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(64));
// Empty and null both mean "no goal" and are stored as NULL.
const Goal = v.pipe(v.string(), v.trim(), v.maxLength(500));

type WritePermission = "space:update" | "content:write";

export type CycleStatus = "upcoming" | "current" | "completed";

export type CycleProgress = {
	total: number;
	backlog: number;
	unstarted: number;
	started: number;
	completed: number;
	cancelled: number;
	/** Story points. Cancelled items are left out of the total, like they are from the bar. */
	points: { total: number; completed: number };
};

/** Frozen soon after the cycle ends. Committed leaves out cancelled items. */
export type CycleVelocity = {
	committed: { items: number; points: number };
	completed: { items: number; points: number };
};

export type CycleSummary = tables["cycle"] & {
	status: CycleStatus;
	progress: CycleProgress;
	/** Only for completed cycles. */
	velocity: CycleVelocity | null;
};

const todayUtc = () => new Date().toISOString().slice(0, 10);

function cycleStatus(
	cycle: Pick<tables["cycle"], "startDate" | "endDate">,
	today: string,
): CycleStatus {
	if (today < cycle.startDate) return "upcoming";
	if (today > cycle.endDate) return "completed";
	return "current";
}

// Asking about a project the viewer can't read must look like it doesn't exist,
// so a private project's ids can't be probed.
async function requireReadableProject(headers: Headers, projectId: string) {
	try {
		await requireProjectPermission(headers, projectId, "space:read", {
			public: true,
		});
	} catch (error) {
		if (error instanceof ORPCError && error.code === "FORBIDDEN") {
			throw new ORPCError("NOT_FOUND");
		}
		throw error;
	}
}

async function requireReadableCycle(headers: Headers, cycleId: string) {
	const cycle = (await sql`SELECT * FROM cycle WHERE id = ${cycleId}`)[0] as
		| tables["cycle"]
		| undefined;
	if (!cycle) {
		await requireUser(headers);
		throw new ORPCError("NOT_FOUND");
	}
	await requireReadableProject(headers, cycle.projectId);
	return cycle;
}

async function requireProject(
	headers: Headers,
	projectId: string,
	permission: WritePermission,
) {
	await requireReadableProject(headers, projectId);
	return requireProjectPermission(headers, projectId, permission);
}

async function requireCycle(
	headers: Headers,
	cycleId: string,
	permission: WritePermission,
) {
	const cycle = await requireReadableCycle(headers, cycleId);
	const access = await requireProjectPermission(
		headers,
		cycle.projectId,
		permission,
	);
	return { cycle, ...access };
}

async function progressOf(cycleIds: string[]) {
	const byCycle = new Map<string, CycleProgress>(
		cycleIds.map((id) => [
			id,
			{
				total: 0,
				backlog: 0,
				unstarted: 0,
				started: 0,
				completed: 0,
				cancelled: 0,
				points: { total: 0, completed: 0 },
			},
		]),
	);
	if (cycleIds.length === 0) return byCycle;

	const rows = (await sql`
		SELECT issue.cycleId AS cycleId, state."group" AS "group", COUNT(*) AS count,
			TOTAL(issue.estimate) AS points
		FROM issue
		JOIN state ON state.id = issue.state
		WHERE issue.cycleId IN ${sql(cycleIds)}
		GROUP BY issue.cycleId, state."group"
	`) as { cycleId: string; group: string; count: number; points: number }[];
	for (const row of rows) {
		const progress = byCycle.get(row.cycleId);
		if (!progress) continue;
		progress.total += row.count;
		// Anything that isn't one of the other groups hasn't been started.
		const key =
			row.group === "backlog" ||
			row.group === "started" ||
			row.group === "completed" ||
			row.group === "cancelled"
				? row.group
				: "unstarted";
		progress[key] += row.count;
		if (key !== "cancelled") progress.points.total += row.points;
		if (key === "completed") progress.points.completed += row.points;
	}
	return byCycle;
}

// Records what the cycles that are over hold now, unless they were frozen already.
// An empty one waits, so a cycle created in the past can still be filled.
async function freezeCompleted(db: SQL, cycleIds: string[], today: string) {
	if (cycleIds.length === 0) return;
	await db`
		INSERT OR IGNORE INTO cycle_snapshot
			(cycleId, committedItems, committedPoints, completedItems, completedPoints, frozenAt)
		SELECT
			cycle.id,
			COUNT(CASE WHEN state."group" <> 'cancelled' THEN 1 END),
			TOTAL(CASE WHEN state."group" <> 'cancelled' THEN issue.estimate END),
			COUNT(CASE WHEN state."group" = 'completed' THEN 1 END),
			TOTAL(CASE WHEN state."group" = 'completed' THEN issue.estimate END),
			${Date.now()}
		FROM cycle
		LEFT JOIN issue ON issue.cycleId = cycle.id
		LEFT JOIN state ON state.id = issue.state
		WHERE cycle.id IN ${db(cycleIds)} AND cycle.endDate < ${today}
		GROUP BY cycle.id
		HAVING COUNT(issue.id) > 0
	`;
}

const EMPTY_VELOCITY: CycleVelocity = {
	committed: { items: 0, points: 0 },
	completed: { items: 0, points: 0 },
};

// Call after freezeCompleted: a completed cycle still without a snapshot is empty.
async function velocityOf(cycleIds: string[]) {
	const byCycle = new Map<string, CycleVelocity>(
		cycleIds.map((id) => [id, EMPTY_VELOCITY]),
	);
	if (cycleIds.length === 0) return byCycle;
	const rows = (await sql`
		SELECT * FROM cycle_snapshot WHERE cycleId IN ${sql(cycleIds)}
	`) as tables["cycle_snapshot"][];
	for (const row of rows) {
		byCycle.set(row.cycleId, {
			committed: { items: row.committedItems, points: row.committedPoints },
			completed: { items: row.completedItems, points: row.completedPoints },
		});
	}
	return byCycle;
}

async function summarize(cycles: tables["cycle"][]): Promise<CycleSummary[]> {
	const today = todayUtc();
	const completedIds = cycles
		.filter((cycle) => cycleStatus(cycle, today) === "completed")
		.map((cycle) => cycle.id);
	await freezeCompleted(sql, completedIds, today);
	const [progress, velocity] = await Promise.all([
		progressOf(cycles.map((cycle) => cycle.id)),
		velocityOf(completedIds),
	]);
	return cycles.map((cycle) => ({
		...cycle,
		status: cycleStatus(cycle, today),
		progress: progress.get(cycle.id) as CycleProgress,
		velocity: velocity.get(cycle.id) ?? null,
	}));
}

const OVERLAP_MESSAGE =
	"This cycle overlaps another cycle in the project. Cycles can't share a day.";
const BACKWARDS_MESSAGE = "The cycle can't end before it starts";

export const findCycles = base
	.input(v.object({ projectId: v.string() }))
	.handler(async ({ input, context }) => {
		await requireReadableProject(context.headers, input.projectId);

		const cycles = (await sql`
			SELECT * FROM cycle WHERE projectId = ${input.projectId}
			ORDER BY startDate, rowid
		`) as tables["cycle"][];
		return summarize(cycles);
	});

export const findCycle = base
	.input(v.object({ id: v.string() }))
	.handler(async ({ input, context }) => {
		const cycle = await requireReadableCycle(context.headers, input.id);
		const [summary] = await summarize([cycle]);
		return summary as CycleSummary;
	});

export const createCycle = base
	.input(
		v.pipe(
			v.object({
				projectId: v.string(),
				name: Name,
				startDate: Day,
				endDate: Day,
				goal: v.optional(v.nullable(Goal)),
			}),
			v.forward(
				v.check((input) => input.endDate >= input.startDate, BACKWARDS_MESSAGE),
				["endDate"],
			),
		),
	)
	.handler(async ({ input, context }) => {
		const { caller } = await requireProject(
			context.headers,
			input.projectId,
			"space:update",
		);

		// The overlap check and the insert are one statement, so two requests for
		// the same days can't both get in.
		const created = (await sql`
			INSERT INTO cycle (id, projectId, name, startDate, endDate, goal, createdBy, createdAt)
			SELECT
				${crypto.randomUUID()}, ${input.projectId}, ${input.name},
				${input.startDate}, ${input.endDate}, ${input.goal || null},
				${caller.userId}, ${Date.now()}
			WHERE NOT EXISTS (
				SELECT 1 FROM cycle AS other
				WHERE other.projectId = ${input.projectId}
					AND other.startDate <= ${input.endDate}
					AND other.endDate >= ${input.startDate}
			)
			RETURNING *
		`) as tables["cycle"][];
		const cycle = created[0];
		if (!cycle) throw new ORPCError("CONFLICT", { message: OVERLAP_MESSAGE });

		const [summary] = await summarize([cycle]);
		return summary as CycleSummary;
	});

export const updateCycle = base
	.input(
		v.object({
			id: NonEmpty,
			name: v.optional(Name),
			startDate: v.optional(Day),
			endDate: v.optional(Day),
			goal: v.optional(v.nullable(Goal)),
		}),
	)
	.handler(async ({ input, context }) => {
		const { cycle: old } = await requireCycle(
			context.headers,
			input.id,
			"space:update",
		);

		const startDate = input.startDate ?? old.startDate;
		const endDate = input.endDate ?? old.endDate;
		if (endDate < startDate) {
			throw new ORPCError("BAD_REQUEST", { message: BACKWARDS_MESSAGE });
		}

		// Unlike the other fields, a goal can be cleared, so COALESCE can't tell
		// "leave it" from "clear it".
		const setGoal = input.goal === undefined ? 0 : 1;

		// The dates are merged with the stored ones inside the statement, so the
		// overlap check sees exactly what will be written, and a concurrent change to
		// the other date isn't overwritten with a stale one.
		let written: { id: string }[];
		try {
			written = (await sql`
				UPDATE cycle SET
					name = COALESCE(${input.name ?? null}, name),
					startDate = COALESCE(${input.startDate ?? null}, startDate),
					endDate = COALESCE(${input.endDate ?? null}, endDate),
					goal = CASE WHEN ${setGoal} = 1 THEN ${input.goal || null} ELSE goal END
				WHERE id = ${input.id}
					AND NOT EXISTS (
						SELECT 1 FROM cycle AS other
						WHERE other.projectId = cycle.projectId
							AND other.id <> cycle.id
							AND other.startDate <= COALESCE(${input.endDate ?? null}, cycle.endDate)
							AND other.endDate >= COALESCE(${input.startDate ?? null}, cycle.startDate)
					)
				RETURNING id
			`) as { id: string }[];
		} catch (error) {
			// A concurrent change to the other date can still make the pair invalid.
			if (
				error instanceof SQL.SQLiteError &&
				error.code === "SQLITE_CONSTRAINT_CHECK"
			) {
				throw new ORPCError("BAD_REQUEST", { message: BACKWARDS_MESSAGE });
			}
			throw error;
		}
		if (written.length === 0) {
			const stillThere = await sql`SELECT id FROM cycle WHERE id = ${input.id}`;
			if (stillThere.length === 0) throw new ORPCError("NOT_FOUND");
			throw new ORPCError("CONFLICT", { message: OVERLAP_MESSAGE });
		}

		// A cycle moved back out of the past isn't over, so it has no velocity yet.
		// One that stays in the past keeps the numbers it was frozen with.
		if (input.startDate !== undefined || input.endDate !== undefined) {
			await sql`
				DELETE FROM cycle_snapshot
				WHERE cycleId = ${input.id}
					AND (SELECT endDate FROM cycle WHERE id = ${input.id}) >= ${todayUtc()}
			`;
		}

		const cycle = (
			await sql`SELECT * FROM cycle WHERE id = ${input.id}`
		)[0] as tables["cycle"];
		const [summary] = await summarize([cycle]);
		return summary as CycleSummary;
	});

export const deleteCycle = base
	.input(v.object({ id: NonEmpty }))
	.handler(async ({ input, context }) => {
		const { cycle, caller, project } = await requireCycle(
			context.headers,
			input.id,
			"space:update",
		);

		// Its items stay, without a cycle, rather than pointing at something gone.
		const released = await sql.begin(async (tx) => {
			const items = (await tx`
				SELECT id, title FROM issue WHERE cycleId = ${cycle.id}
			`) as Pick<tables["issue"], "id" | "title">[];
			await tx`
				UPDATE issue SET
					cycleId = NULL,
					updatedAt = ${Date.now()},
					updatedBy = ${caller.userId}
				WHERE cycleId = ${cycle.id}
			`;
			await tx`DELETE FROM cycle WHERE id = ${cycle.id}`;
			return items;
		});

		for (const item of released) {
			eventBus.emit({
				type: "issue.updated",
				entityId: item.id,
				workspaceId: project.workspaceId,
				actorId: caller.userId,
				payload: {
					projectId: project.id,
					title: item.title,
					field: "cycle",
					oldValue: cycle.name,
					newValue: null,
				},
			});
		}

		return { id: cycle.id };
	});

export const moveUnfinishedToCycle = base
	.input(v.object({ fromCycleId: NonEmpty, toCycleId: NonEmpty }))
	.handler(async ({ input, context }) => {
		const {
			cycle: from,
			caller,
			project,
		} = await requireCycle(context.headers, input.fromCycleId, "content:write");

		const wrongTarget = new ORPCError("BAD_REQUEST", {
			message: "Choose another cycle in this project",
		});
		if (input.toCycleId === from.id) throw wrongTarget;

		// Checks and writes share one transaction, so a cycle deleted in between
		// can't leave items pointing at it.
		const { items, target } = await sql.begin(async (tx) => {
			const target = (
				await tx`SELECT * FROM cycle WHERE id = ${input.toCycleId} AND projectId = ${from.projectId}`
			)[0] as tables["cycle"] | undefined;
			if (!target) throw wrongTarget;
			const source = (await tx`SELECT id FROM cycle WHERE id = ${from.id}`)[0];
			if (!source) throw new ORPCError("NOT_FOUND");
			await freezeCompleted(tx, [from.id], todayUtc());

			// One statement picks and moves the items, so what is logged is exactly
			// what moved, even if an item's state changes at the same moment.
			const items = (await tx`
				UPDATE issue SET
					cycleId = ${target.id},
					updatedAt = ${Date.now()},
					updatedBy = ${caller.userId}
				WHERE cycleId = ${from.id}
					AND state IN (
						SELECT id FROM state WHERE "group" NOT IN ('completed', 'cancelled')
					)
				RETURNING id, title
			`) as Pick<tables["issue"], "id" | "title">[];
			items.sort((a, b) => a.id.localeCompare(b.id));
			return { items, target };
		});

		for (const item of items) {
			eventBus.emit({
				type: "issue.updated",
				entityId: item.id,
				workspaceId: project.workspaceId,
				actorId: caller.userId,
				payload: {
					projectId: project.id,
					title: item.title,
					field: "cycle",
					oldValue: from.name,
					newValue: target.name,
				},
			});
		}

		return { moved: items.length };
	});
