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

export type CycleSummary = tables["cycle"] & {
	status: CycleStatus;
	progress: CycleProgress;
};

export type CycleBurnup = {
	unit: "points" | "items";
	days: { day: string; scope: number; completed: number }[];
};

type Snapshot = { inCycle: boolean; estimate: number | null; group: string };

export type BurnupItem = Snapshot & { id: string };

export type BurnupLog = {
	entityId: string;
	action: string;
	field: string | null;
	oldValue: string | null;
	/** Undefined for logs written before cycle changes carried ids. */
	oldCycleId?: string | null;
	createdAt: number;
};

type BurnupContext = {
	cycle: Pick<tables["cycle"], "id" | "name">;
	groupOf: Map<string, string>;
};

// How to step an item back over one of its logs, keyed by field (or action for
// "created", which has no field).
const UNDO: Record<
	string,
	(snapshot: Snapshot, log: BurnupLog, context: BurnupContext) => Snapshot
> = {
	status: (snapshot, log, { groupOf }) => ({
		...snapshot,
		group: groupOf.get(log.oldValue ?? "") ?? "unstarted",
	}),
	estimate: (snapshot, log) => {
		const estimate = log.oldValue === null ? null : Number(log.oldValue);
		return {
			...snapshot,
			estimate: Number.isFinite(estimate) ? estimate : null,
		};
	},
	cycle: (snapshot, log, { cycle }) => ({
		...snapshot,
		inCycle:
			log.oldCycleId === undefined
				? log.oldValue === cycle.name
				: log.oldCycleId === cycle.id,
	}),
	created: (snapshot) => ({ ...snapshot, inCycle: false }),
};

const DAY_MS = 24 * 60 * 60 * 1000;

function cycleDays(
	cycle: Pick<tables["cycle"], "startDate" | "endDate">,
	today: string,
) {
	const last = today < cycle.endDate ? today : cycle.endDate;
	const days: string[] = [];
	for (
		let time = Date.parse(`${cycle.startDate}T00:00:00Z`);
		new Date(time).toISOString().slice(0, 10) <= last;
		time += DAY_MS
	) {
		days.push(new Date(time).toISOString().slice(0, 10));
	}
	return days;
}

/**
 * Replays history backwards from the items' current rows. Each day is the state
 * at its end in UTC. Logs must be newest first.
 */
export function burnup(
	items: BurnupItem[],
	logs: BurnupLog[],
	days: string[],
	context: BurnupContext,
): CycleBurnup {
	const logsOf = new Map<string, BurnupLog[]>();
	for (const log of logs) {
		const history = logsOf.get(log.entityId);
		if (history) history.push(log);
		else logsOf.set(log.entityId, [log]);
	}
	const totals = days.map(() => ({
		points: { scope: 0, completed: 0 },
		items: { scope: 0, completed: 0 },
	}));

	for (const { id, ...current } of items) {
		const history = logsOf.get(id) ?? [];
		let snapshot: Snapshot = current;
		let next = 0;
		for (let index = days.length - 1; index >= 0; index--) {
			const dayEnd = Date.parse(`${days[index]}T00:00:00Z`) + DAY_MS;
			for (; next < history.length; next++) {
				const log = history[next] as BurnupLog;
				if (log.createdAt < dayEnd) break;
				const undo = UNDO[log.field ?? log.action];
				if (undo) snapshot = undo(snapshot, log, context);
			}
			if (!snapshot.inCycle || snapshot.group === "cancelled") continue;
			const total = totals[index] as (typeof totals)[number];
			const points = snapshot.estimate ?? 0;
			total.points.scope += points;
			total.items.scope += 1;
			if (snapshot.group === "completed") {
				total.points.completed += points;
				total.items.completed += 1;
			}
		}
	}

	const unit = totals.some((total) => total.points.scope > 0)
		? "points"
		: "items";
	return {
		unit,
		days: days.map((day, index) => ({
			day,
			...(totals[index] as (typeof totals)[number])[unit],
		})),
	};
}

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

async function summarize(cycles: tables["cycle"][]): Promise<CycleSummary[]> {
	const progress = await progressOf(cycles.map((cycle) => cycle.id));
	const today = todayUtc();
	return cycles.map((cycle) => ({
		...cycle,
		status: cycleStatus(cycle, today),
		progress: progress.get(cycle.id) as CycleProgress,
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

export const findCycleBurnup = base
	.input(v.object({ id: v.string() }))
	.handler(async ({ input, context }): Promise<CycleBurnup> => {
		const cycle = await requireReadableCycle(context.headers, input.id);
		const days = cycleDays(cycle, todayUtc());
		if (days.length === 0) return { unit: "items", days: [] };

		// Items in the cycle now, and items that were in it at some point. Logs
		// from before cycle changes carried ids only have the cycle's name.
		const rows = (await sql`
			SELECT issue.id, issue.cycleId, issue.estimate, state."group" AS "group"
			FROM issue
			LEFT JOIN state ON state.id = issue.state
			WHERE issue.projectId = ${cycle.projectId}
				AND (
					issue.cycleId = ${cycle.id}
					OR EXISTS (
						SELECT 1 FROM activity_logs AS log
						WHERE log.entityType = 'issue'
							AND log.entityId = issue.id
							AND log.field = 'cycle'
							AND (
								json_extract(log.metadata, '$.oldCycleId') = ${cycle.id}
								OR json_extract(log.metadata, '$.newCycleId') = ${cycle.id}
								OR (
									json_type(log.metadata, '$.oldCycleId') IS NULL
									AND (log.oldValue = ${cycle.name} OR log.newValue = ${cycle.name})
								)
							)
					)
				)
		`) as (Pick<tables["issue"], "id" | "cycleId" | "estimate"> & {
			group: string | null;
		})[];
		const items = rows.map((row) => ({
			id: row.id,
			inCycle: row.cycleId === cycle.id,
			estimate: row.estimate,
			group: row.group ?? "unstarted",
		}));

		const logs =
			items.length === 0
				? []
				: (
						(await sql`
							SELECT entityId, action, field, oldValue, createdAt,
								json_extract(metadata, '$.oldCycleId') AS oldCycleId,
								json_type(metadata, '$.oldCycleId') IS NOT NULL AS hasCycleIds
							FROM activity_logs
							WHERE entityType = 'issue'
								AND entityId IN ${sql(items.map((item) => item.id))}
								AND (field IN ('status', 'estimate', 'cycle') OR action = 'created')
							ORDER BY createdAt DESC, rowid DESC
						`) as (BurnupLog & { hasCycleIds: number })[]
					).map(({ hasCycleIds, ...log }) => ({
						...log,
						oldCycleId: hasCycleIds ? log.oldCycleId : undefined,
					}));

		const states = (await sql`
			SELECT id, "group" FROM state WHERE projectId = ${cycle.projectId}
		`) as Pick<tables["state"], "id" | "group">[];
		return burnup(items, logs, days, {
			cycle,
			groupOf: new Map(states.map((state) => [state.id, state.group])),
		});
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
					oldCycleId: cycle.id,
					newCycleId: null,
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
					oldCycleId: from.id,
					newCycleId: target.id,
				},
			});
		}

		return { moved: items.length };
	});
