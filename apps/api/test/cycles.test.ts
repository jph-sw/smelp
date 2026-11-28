import { beforeAll, describe, expect, test } from "bun:test";
import { createRouterClient } from "@orpc/server";

// Imported dynamically so setup.ts points the database at a temp file first.
await import("./setup");
const { Auth } = await import("@smelp/auth");
const { DB } = await import("@smelp/db");
const { router } = await import("../src/router");

const sql = new DB().sqlite;
const auth = new Auth();

const WORKSPACE = "cycle_tests";
const PROJECT = "CYC";
const OTHER_PROJECT = "CYO";
const PRIVATE_PROJECT = "CYP";

const expectCode = (call: Promise<unknown>, code: string) =>
	expect(call).rejects.toMatchObject({ code });

let userCount = 0;
async function createUser(name: string) {
	userCount += 1;
	const { session, user } = await auth.signUp(
		`cyc-${name}-${userCount}@example.test`,
		name,
		`cyc-${name}-${userCount}`,
		"correct-horse-battery",
	);
	const headers = new Headers({
		cookie: `auth_session=${session.authSessionToken}`,
	});
	return {
		id: user.id,
		client: createRouterClient(router, {
			context: { headers, ip: "198.51.100.10" },
		}),
	};
}
type User = Awaited<ReturnType<typeof createUser>>;

let admin: User;
let member: User;
let guest: User;
let outsider: User;
// State ids by name per project: Backlog, Todo, In Progress, Done.
const states: Record<string, Record<string, string>> = {};

// A day counted from today, in UTC like the API.
function day(offset: number) {
	const date = new Date();
	date.setUTCDate(date.getUTCDate() + offset);
	return date.toISOString().slice(0, 10);
}

let counter = 0;
// Each call hands out a stretch of days far from every other, so cycles made by
// different tests never overlap. Tests that need a status or an overlap use fixed days.
function window() {
	counter += 1;
	const start = 1000 + counter * 20;
	return { startDate: day(start), endDate: day(start + 9) };
}

const newCycle = (name: string, dates = window(), projectId = PROJECT) => ({
	projectId,
	name,
	...dates,
});

const newIssue = (
	title: string,
	stateName = "Backlog",
	projectId = PROJECT,
) => ({
	title,
	description: "",
	state: states[projectId]?.[stateName] ?? "",
	workspaceId: WORKSPACE,
	projectId,
});

async function addMember(spaceId: string, userId: string, role: string) {
	await sql`INSERT INTO auth_space_member ${sql({
		id: crypto.randomUUID(),
		spaceId,
		userId,
		role,
		createdAt: Date.now(),
	})}`;
}

// Events are written by a subscriber after the call returns, so wait for them.
async function activityOf(issueId: string, count: number) {
	for (let attempt = 0; attempt < 200; attempt++) {
		const rows = (await admin.client.activity.findForIssue({ issueId })).filter(
			(row) => row.field === "cycle",
		);
		if (rows.length >= count) return rows;
		await Bun.sleep(10);
	}
	throw new Error("The cycle events never arrived");
}

beforeAll(async () => {
	admin = await createUser("admin");
	member = await createUser("member");
	guest = await createUser("guest");
	outsider = await createUser("outsider");

	await admin.client.workspace.create({ name: "Cycle tests" });
	for (const [id, access] of [
		[PROJECT, "public"],
		[OTHER_PROJECT, "public"],
		[PRIVATE_PROJECT, "private"],
	] as const) {
		await admin.client.project.create({
			id,
			name: `Project ${id}`,
			description: "",
			access,
			icon: "AppWindowIcon",
			workspaceId: WORKSPACE,
		});
		const found = await admin.client.states.find({ projectId: id });
		states[id] = Object.fromEntries(found.map((s) => [s.name, s.id]));
	}
	for (const user of [member, guest, outsider]) {
		await addMember(WORKSPACE, user.id, "member");
	}
	await addMember(PROJECT, member.id, "member");
	await addMember(PROJECT, guest.id, "guest");
	await addMember(OTHER_PROJECT, member.id, "member");
	await addMember(PRIVATE_PROJECT, member.id, "member");
});

describe("cycles", () => {
	test("creates, lists and derives the status from the dates", async () => {
		const past = await admin.client.cycles.create(
			newCycle("Past", { startDate: day(-30), endDate: day(-20) }),
		);
		const current = await admin.client.cycles.create(
			newCycle("Current", { startDate: day(-5), endDate: day(5) }),
		);
		const upcoming = await admin.client.cycles.create(
			newCycle("Upcoming", { startDate: day(10), endDate: day(20) }),
		);
		expect([past.status, current.status, upcoming.status]).toEqual([
			"completed",
			"current",
			"upcoming",
		]);

		const listed = await member.client.cycles.find({ projectId: PROJECT });
		const names = listed.map((cycle) => cycle.name);
		expect(names.indexOf("Past")).toBeLessThan(names.indexOf("Current"));
		expect(names.indexOf("Current")).toBeLessThan(names.indexOf("Upcoming"));
		expect(
			(await member.client.cycles.findOne({ id: current.id })).status,
		).toBe("current");
		// Another project's list doesn't include them.
		expect(
			(await member.client.cycles.find({ projectId: OTHER_PROJECT })).length,
		).toBe(0);
	});

	test("a one-day cycle is allowed; end before start and bad dates are refused", async () => {
		const dates = window();
		const single = await admin.client.cycles.create(
			newCycle("One day", {
				startDate: dates.startDate,
				endDate: dates.startDate,
			}),
		);
		expect(single.startDate).toBe(single.endDate);

		const other = window();
		await expectCode(
			admin.client.cycles.create(
				newCycle("Backwards", {
					startDate: other.endDate,
					endDate: other.startDate,
				}),
			),
			"BAD_REQUEST",
		);
		await expectCode(
			admin.client.cycles.create(
				newCycle("Impossible", {
					startDate: "2099-02-30",
					endDate: "2099-03-02",
				}),
			),
			"BAD_REQUEST",
		);
		await expectCode(
			admin.client.cycles.create(
				newCycle("Not a date", { startDate: "soon", endDate: other.endDate }),
			),
			"BAD_REQUEST",
		);
		await expectCode(
			admin.client.cycles.create(newCycle("   ", other)),
			"BAD_REQUEST",
		);
	});

	test("refuses overlapping cycles in a project, but not adjacent or other projects", async () => {
		const base = await admin.client.cycles.create(
			newCycle("Base", { startDate: day(3000), endDate: day(3009) }),
		);
		const overlaps: [string, string][] = [
			[day(2995), day(3000)], // touches the first day
			[day(3009), day(3015)], // touches the last day
			[day(3002), day(3004)], // inside
			[day(2990), day(3020)], // around
		];
		for (const [startDate, endDate] of overlaps) {
			await expectCode(
				admin.client.cycles.create(newCycle("Overlap", { startDate, endDate })),
				"CONFLICT",
			);
		}
		const next = await admin.client.cycles.create(
			newCycle("Next", { startDate: day(3010), endDate: day(3019) }),
		);
		await admin.client.cycles.create(
			newCycle(
				"Elsewhere",
				{ startDate: day(3000), endDate: day(3009) },
				OTHER_PROJECT,
			),
		);

		// Updating: moving into a neighbour is refused, a cycle never clashes with itself.
		await expectCode(
			admin.client.cycles.update({ id: next.id, startDate: day(3009) }),
			"CONFLICT",
		);
		const renamed = await admin.client.cycles.update({
			id: base.id,
			name: "Base renamed",
			endDate: day(3009),
		});
		expect(renamed.name).toBe("Base renamed");
		const shrunk = await admin.client.cycles.update({
			id: base.id,
			endDate: day(3005),
		});
		expect(shrunk.endDate).toBe(day(3005));
		expect(shrunk.startDate).toBe(day(3000));
		// An end before the stored start is refused even when only one date is sent.
		await expectCode(
			admin.client.cycles.update({ id: base.id, endDate: day(2990) }),
			"BAD_REQUEST",
		);
	});

	test("simultaneous requests for the same days can't both succeed", async () => {
		const dates = window();
		const results = await Promise.allSettled(
			Array.from({ length: 5 }, (_, i) =>
				admin.client.cycles.create(newCycle(`Race ${i}`, dates)),
			),
		);
		expect(results.filter((r) => r.status === "fulfilled").length).toBe(1);
	});

	test("a goal is set, kept, cleared and limited to 500 characters", async () => {
		const created = await admin.client.cycles.create({
			...newCycle("With a goal"),
			goal: "  Ship the board filters.  ",
		});
		expect(created.goal).toBe("Ship the board filters.");
		const plain = await admin.client.cycles.create(newCycle("No goal"));
		expect(plain.goal).toBeNull();
		const blank = await admin.client.cycles.create({
			...newCycle("Blank goal"),
			goal: "   ",
		});
		expect(blank.goal).toBeNull();

		const set = await admin.client.cycles.update({
			id: plain.id,
			goal: "Line one\nLine two",
		});
		expect(set.goal).toBe("Line one\nLine two");
		const renamed = await admin.client.cycles.update({
			id: plain.id,
			name: "Renamed",
		});
		expect(renamed.goal).toBe("Line one\nLine two");

		const listed = await member.client.cycles.find({ projectId: PROJECT });
		expect(listed.find((c) => c.id === created.id)?.goal).toBe(
			"Ship the board filters.",
		);
		expect((await member.client.cycles.findOne({ id: plain.id })).goal).toBe(
			"Line one\nLine two",
		);

		await admin.client.cycles.update({ id: plain.id, goal: "" });
		expect(
			(await member.client.cycles.findOne({ id: plain.id })).goal,
		).toBeNull();
		await admin.client.cycles.update({ id: created.id, goal: null });
		expect(
			(await member.client.cycles.findOne({ id: created.id })).goal,
		).toBeNull();

		await expectCode(
			admin.client.cycles.update({ id: plain.id, goal: "x".repeat(501) }),
			"BAD_REQUEST",
		);
		await expectCode(
			admin.client.cycles.create({
				...newCycle("Too long"),
				goal: "x".repeat(501),
			}),
			"BAD_REQUEST",
		);
		const longest = await admin.client.cycles.update({
			id: plain.id,
			goal: "x".repeat(500),
		});
		expect(longest.goal).toHaveLength(500);
	});

	test("empty ids and unknown cycles are rejected", async () => {
		await expectCode(
			admin.client.cycles.update({ id: "", name: "x" }),
			"BAD_REQUEST",
		);
		await expectCode(admin.client.cycles.delete({ id: "" }), "BAD_REQUEST");
		await expectCode(
			admin.client.cycles.update({ id: "nope", name: "x" }),
			"NOT_FOUND",
		);
		await expectCode(admin.client.cycles.findOne({ id: "nope" }), "NOT_FOUND");
		await expectCode(
			admin.client.cycles.find({ projectId: "NOPE" }),
			"NOT_FOUND",
		);
	});
});

describe("permissions", () => {
	test("only project admins manage cycles; guests and members read or assign", async () => {
		const cycle = await admin.client.cycles.create(newCycle("Managed"));

		for (const user of [member, guest]) {
			await expectCode(
				user.client.cycles.create(newCycle("Nope")),
				"FORBIDDEN",
			);
			await expectCode(
				user.client.cycles.update({ id: cycle.id, name: "Nope" }),
				"FORBIDDEN",
			);
			await expectCode(
				user.client.cycles.delete({ id: cycle.id }),
				"FORBIDDEN",
			);
			expect((await user.client.cycles.findOne({ id: cycle.id })).id).toBe(
				cycle.id,
			);
		}

		const issue = await member.client.issue.create(newIssue("Assignable"));
		const assigned = await member.client.issue.update({
			id: issue.id,
			cycleId: cycle.id,
		});
		expect(assigned.cycleId).toBe(cycle.id);
		await expectCode(
			guest.client.issue.update({ id: issue.id, cycleId: null }),
			"FORBIDDEN",
		);
	});

	test("archived projects are read-only", async () => {
		const cycle = await admin.client.cycles.create(newCycle("Archived"));
		const other = await admin.client.cycles.create(newCycle("Archived 2"));
		const issue = await member.client.issue.create(newIssue("Archived item"));
		await member.client.issue.update({ id: issue.id, cycleId: cycle.id });

		await admin.client.project.archive({ projectId: PROJECT });
		try {
			await expectCode(
				admin.client.cycles.create(newCycle("Late")),
				"FORBIDDEN",
			);
			await expectCode(
				admin.client.cycles.update({ id: cycle.id, name: "Late" }),
				"FORBIDDEN",
			);
			await expectCode(
				admin.client.cycles.delete({ id: cycle.id }),
				"FORBIDDEN",
			);
			await expectCode(
				member.client.issue.update({ id: issue.id, cycleId: other.id }),
				"FORBIDDEN",
			);
			await expectCode(
				member.client.cycles.moveUnfinished({
					fromCycleId: cycle.id,
					toCycleId: other.id,
				}),
				"FORBIDDEN",
			);
			expect((await admin.client.cycles.findOne({ id: cycle.id })).id).toBe(
				cycle.id,
			);
		} finally {
			await admin.client.project.unarchive({ projectId: PROJECT });
		}
	});

	test("a private project's cycles look missing to people who can't read it", async () => {
		const cycle = await admin.client.cycles.create(
			newCycle("Secret", window(), PRIVATE_PROJECT),
		);
		const item = await admin.client.issue.create(
			newIssue("Secret item", "Backlog", PRIVATE_PROJECT),
		);
		await admin.client.issue.update({ id: item.id, cycleId: cycle.id });
		const target = await admin.client.cycles.create(
			newCycle("Secret 2", window(), PRIVATE_PROJECT),
		);

		await expectCode(
			outsider.client.cycles.find({ projectId: PRIVATE_PROJECT }),
			"NOT_FOUND",
		);
		await expectCode(
			outsider.client.cycles.findOne({ id: cycle.id }),
			"NOT_FOUND",
		);
		await expectCode(
			outsider.client.cycles.create(
				newCycle("Probe", window(), PRIVATE_PROJECT),
			),
			"NOT_FOUND",
		);
		await expectCode(
			outsider.client.cycles.update({ id: cycle.id, name: "Probe" }),
			"NOT_FOUND",
		);
		await expectCode(
			outsider.client.cycles.delete({ id: cycle.id }),
			"NOT_FOUND",
		);
		await expectCode(
			outsider.client.cycles.moveUnfinished({
				fromCycleId: cycle.id,
				toCycleId: target.id,
			}),
			"NOT_FOUND",
		);
		// The same answer as for an id that was never there.
		await expectCode(
			outsider.client.cycles.findOne({ id: "never-existed" }),
			"NOT_FOUND",
		);
		// The assignment is logged, but only people in the project see it in the feed.
		await activityOf(item.id, 1);
		const seenBy = async (user: User) =>
			(
				await user.client.activity.findWorkspace({ workspaceId: WORKSPACE })
			).events.filter((event) => event.issue?.id === item.id);
		expect((await seenBy(member)).length).toBeGreaterThan(0);
		expect(await seenBy(outsider)).toEqual([]);
		// And nothing happened to the item.
		expect((await admin.client.issue.find({ issueId: item.id })).cycleId).toBe(
			cycle.id,
		);
	});
});

describe("work items in cycles", () => {
	test("sets, changes and clears a cycle; it must be in the same project", async () => {
		const a = await admin.client.cycles.create(newCycle("A"));
		const b = await admin.client.cycles.create(newCycle("B"));
		const elsewhere = await admin.client.cycles.create(
			newCycle("Elsewhere", window(), OTHER_PROJECT),
		);
		const issue = await member.client.issue.create(newIssue("Item"));
		expect(issue.cycleId).toBeNull();

		expect(
			(await member.client.issue.update({ id: issue.id, cycleId: a.id }))
				.cycleId,
		).toBe(a.id);
		expect(
			(await member.client.issue.update({ id: issue.id, cycleId: b.id }))
				.cycleId,
		).toBe(b.id);
		// The board's list carries it, for filtering.
		const listed = await member.client.issues.find({ projectId: PROJECT });
		expect(listed.find((i) => i.id === issue.id)?.cycleId).toBe(b.id);

		await expectCode(
			member.client.issue.update({ id: issue.id, cycleId: elsewhere.id }),
			"BAD_REQUEST",
		);
		await expectCode(
			member.client.issue.update({ id: issue.id, cycleId: "missing" }),
			"BAD_REQUEST",
		);
		await expectCode(
			member.client.issue.update({ id: issue.id, cycleId: "" }),
			"BAD_REQUEST",
		);
		expect(
			(await member.client.issue.find({ issueId: issue.id })).cycleId,
		).toBe(b.id);

		expect(
			(await member.client.issue.update({ id: issue.id, cycleId: null }))
				.cycleId,
		).toBeNull();
	});

	test("progress counts items by state group", async () => {
		const cycle = await admin.client.cycles.create(newCycle("Progress"));
		for (const [title, stateName] of [
			["P1", "Backlog"],
			["P2", "Todo"],
			["P3", "In Progress"],
			["P4", "In Progress"],
			["P5", "Done"],
		] as const) {
			const issue = await member.client.issue.create(
				newIssue(title, stateName),
			);
			await member.client.issue.update({ id: issue.id, cycleId: cycle.id });
		}
		const { progress } = await member.client.cycles.findOne({ id: cycle.id });
		expect(progress).toEqual({
			total: 5,
			backlog: 1,
			unstarted: 1,
			started: 2,
			completed: 1,
			cancelled: 0,
			points: { total: 0, completed: 0 },
		});
		const listed = await member.client.cycles.find({ projectId: PROJECT });
		expect(listed.find((c) => c.id === cycle.id)?.progress.total).toBe(5);
	});

	test("progress totals story points, done and overall, without cancelled items", async () => {
		const cancelled = await admin.client.state.create({
			projectId: PROJECT,
			name: "Won't do",
			color: "#999999",
			group: "cancelled",
		});
		const cycle = await admin.client.cycles.create(newCycle("Points"));
		for (const [title, stateName, estimate] of [
			["Three", "Done", 3],
			["Five", "In Progress", 5],
			["Eight", "Todo", 8],
		] as const) {
			await member.client.issue.create({
				...newIssue(title, stateName),
				cycleId: cycle.id,
				estimate,
			});
		}
		await member.client.issue.create({
			...newIssue("Unestimated", "Todo"),
			cycleId: cycle.id,
		});
		await member.client.issue.create({
			...newIssue("Dropped"),
			state: cancelled.id,
			cycleId: cycle.id,
			estimate: 13,
		});

		const { progress } = await member.client.cycles.findOne({ id: cycle.id });
		expect(progress.points).toEqual({ total: 16, completed: 3 });
		const listed = await member.client.cycles.find({ projectId: PROJECT });
		expect(listed.find((c) => c.id === cycle.id)?.progress.points).toEqual({
			total: 16,
			completed: 3,
		});
	});

	test("logs a cycle change in the item timeline and the workspace feed", async () => {
		const cycle = await admin.client.cycles.create(newCycle("Logged"));
		const issue = await member.client.issue.create(newIssue("Logged item"));
		await member.client.issue.update({ id: issue.id, cycleId: cycle.id });
		await member.client.issue.update({ id: issue.id, cycleId: null });
		// Setting what is already there logs nothing.
		await member.client.issue.update({ id: issue.id, cycleId: null });

		const rows = await activityOf(issue.id, 2);
		expect(rows.map((r) => [r.action, r.oldValue, r.newValue])).toEqual([
			["issue.updated", null, "Logged"],
			["issue.updated", "Logged", null],
		]);

		const feed = await member.client.activity.findWorkspace({
			workspaceId: WORKSPACE,
		});
		const entries = feed.events.filter(
			(event) =>
				event.issue?.id === issue.id && event.details.field === "cycle",
		);
		expect(entries.length).toBe(2);
		expect(entries.map((e) => e.details.to)).toContain("Logged");
	});
});

describe("creating a work item in a cycle", () => {
	test("stores the cycle and logs it by name", async () => {
		const cycle = await admin.client.cycles.create(newCycle("Created in"));
		const issue = await member.client.issue.create({
			...newIssue("Born in a cycle"),
			cycleId: cycle.id,
		});
		expect(issue.cycleId).toBe(cycle.id);

		const listed = await member.client.issues.find({ projectId: PROJECT });
		expect(listed.find((i) => i.id === issue.id)?.cycleId).toBe(cycle.id);

		const rows = await activityOf(issue.id, 1);
		expect(rows.map((r) => [r.action, r.oldValue, r.newValue])).toEqual([
			["issue.updated", null, "Created in"],
		]);
	});

	test("refuses a cycle of another project, a missing one and an empty id", async () => {
		const elsewhere = await admin.client.cycles.create(
			newCycle("Other project", window(), OTHER_PROJECT),
		);
		for (const cycleId of [elsewhere.id, "no-such-cycle", ""]) {
			await expectCode(
				member.client.issue.create({ ...newIssue("Refused"), cycleId }),
				"BAD_REQUEST",
			);
		}
	});
});

describe("moving unfinished items", () => {
	test("moves only unfinished items and logs each one", async () => {
		const from = await admin.client.cycles.create(newCycle("From"));
		const to = await admin.client.cycles.create(newCycle("To"));
		const make = async (title: string, stateName: string) => {
			const issue = await member.client.issue.create(
				newIssue(title, stateName),
			);
			await member.client.issue.update({ id: issue.id, cycleId: from.id });
			return issue;
		};
		const todo = await make("M-todo", "Todo");
		const doing = await make("M-doing", "In Progress");
		const done = await make("M-done", "Done");

		const result = await member.client.cycles.moveUnfinished({
			fromCycleId: from.id,
			toCycleId: to.id,
		});
		expect(result.moved).toBe(2);

		const cycleOf = async (id: string) =>
			(await member.client.issue.find({ issueId: id })).cycleId;
		expect(await cycleOf(todo.id)).toBe(to.id);
		expect(await cycleOf(doing.id)).toBe(to.id);
		expect(await cycleOf(done.id)).toBe(from.id);

		const rows = await activityOf(todo.id, 2);
		expect(rows.at(-1)?.oldValue).toBe("From");
		expect(rows.at(-1)?.newValue).toBe("To");
		// The finished item was left alone and logged only its own assignment.
		expect((await activityOf(done.id, 1)).length).toBe(1);

		// Nothing left to move is not an error.
		expect(
			(
				await member.client.cycles.moveUnfinished({
					fromCycleId: from.id,
					toCycleId: to.id,
				})
			).moved,
		).toBe(0);
	});

	test("the target must be another cycle in the same project; guests can't", async () => {
		const from = await admin.client.cycles.create(newCycle("From 2"));
		const elsewhere = await admin.client.cycles.create(
			newCycle("Elsewhere 2", window(), OTHER_PROJECT),
		);
		const to = await admin.client.cycles.create(newCycle("To 2"));
		const issue = await member.client.issue.create(newIssue("Stay"));
		await member.client.issue.update({ id: issue.id, cycleId: from.id });

		for (const toCycleId of [from.id, elsewhere.id, "missing"]) {
			await expectCode(
				member.client.cycles.moveUnfinished({
					fromCycleId: from.id,
					toCycleId,
				}),
				"BAD_REQUEST",
			);
		}
		await expectCode(
			member.client.cycles.moveUnfinished({
				fromCycleId: from.id,
				toCycleId: "",
			}),
			"BAD_REQUEST",
		);
		await expectCode(
			guest.client.cycles.moveUnfinished({
				fromCycleId: from.id,
				toCycleId: to.id,
			}),
			"FORBIDDEN",
		);
		expect(
			(await member.client.issue.find({ issueId: issue.id })).cycleId,
		).toBe(from.id);
	});
});

describe("deleting a cycle", () => {
	test("keeps its items without a cycle and logs each one", async () => {
		const cycle = await admin.client.cycles.create(newCycle("Doomed"));
		const issue = await member.client.issue.create(newIssue("Survivor"));
		await member.client.issue.update({ id: issue.id, cycleId: cycle.id });

		await admin.client.cycles.delete({ id: cycle.id });

		const after = await member.client.issue.find({ issueId: issue.id });
		expect(after.cycleId).toBeNull();
		await expectCode(
			member.client.cycles.findOne({ id: cycle.id }),
			"NOT_FOUND",
		);

		const rows = await activityOf(issue.id, 2);
		expect(rows.at(-1)?.oldValue).toBe("Doomed");
		expect(rows.at(-1)?.newValue).toBeNull();
	});
});

describe("burn-up", () => {
	const at = (date: string, hour: number) =>
		Date.parse(`${date}T${String(hour).padStart(2, "0")}:00:00Z`);

	type Seed = {
		title: string;
		state: string;
		cycleId: string | null;
		estimate: number | null;
	};
	type SeedLog = {
		action?: string;
		field?: string;
		oldValue?: string | null;
		newValue?: string | null;
		metadata?: Record<string, unknown>;
		createdAt: number;
	};

	// Items with exactly the history given: the rows are set to their final state
	// and the logs the API wrote on creation are swapped for the seeded ones.
	async function seed(item: Seed, logs: SeedLog[]) {
		const issue = await admin.client.issue.create(
			newIssue(item.title, "Backlog", OTHER_PROJECT),
		);
		for (let attempt = 0; ; attempt++) {
			const [row] = await sql`
				SELECT COUNT(*) AS count FROM activity_logs
				WHERE entityId = ${issue.id} AND action = 'created'
			`;
			if (row.count > 0) break;
			if (attempt > 200) throw new Error("The created event never arrived");
			await Bun.sleep(10);
		}
		await sql`DELETE FROM activity_logs WHERE entityId = ${issue.id}`;
		await sql`
			UPDATE issue SET
				state = ${states[OTHER_PROJECT]?.[item.state]},
				cycleId = ${item.cycleId},
				estimate = ${item.estimate}
			WHERE id = ${issue.id}
		`;
		for (const log of logs) {
			const field = log.field ?? null;
			await sql`INSERT INTO activity_logs ${sql({
				id: crypto.randomUUID(),
				workspaceId: WORKSPACE,
				entityType: "issue",
				entityId: issue.id,
				action:
					log.action ??
					(field === "status" ? "status_changed" : "issue.updated"),
				actorId: admin.id,
				field,
				oldValue: log.oldValue ?? null,
				newValue: log.newValue ?? null,
				metadata: JSON.stringify({ field, ...log.metadata }),
				createdAt: log.createdAt,
			})}`;
		}
		return issue;
	}

	test("replays history into daily scope and completed numbers", async () => {
		const [d0, d1, d2, today] = [day(-3), day(-2), day(-1), day(0)] as [
			string,
			string,
			string,
			string,
		];
		const cycle = await admin.client.cycles.create(
			newCycle("Burnup", { startDate: d0, endDate: day(6) }, OTHER_PROJECT),
		);
		const before = at(day(-10), 9);
		const created = { action: "created", createdAt: before };
		const joined = {
			field: "cycle",
			newValue: "Burnup",
			metadata: { oldCycleId: null, newCycleId: cycle.id },
			createdAt: before + 1,
		};
		const status = (from: string, to: string, createdAt: number) => ({
			field: "status",
			oldValue: states[OTHER_PROJECT]?.[from],
			newValue: states[OTHER_PROJECT]?.[to],
			createdAt,
		});

		// In scope from the start, finished on day 2.
		await seed(
			{ title: "Early", state: "Done", cycleId: cycle.id, estimate: 3 },
			[created, joined, status("Todo", "Done", at(d1, 12))],
		);
		// In scope from the start, finished on day 3.
		await seed(
			{ title: "Later", state: "Done", cycleId: cycle.id, estimate: 5 },
			[created, joined, status("In Progress", "Done", at(d2, 15))],
		);
		// Created and added on day 2.
		await seed(
			{ title: "Added", state: "Todo", cycleId: cycle.id, estimate: 2 },
			[
				{ action: "created", createdAt: at(d1, 9) },
				{ ...joined, createdAt: at(d1, 10) },
			],
		);
		// Re-estimated from 1 to 8 on day 3.
		await seed(
			{ title: "Re-estimated", state: "Todo", cycleId: cycle.id, estimate: 8 },
			[
				created,
				joined,
				{
					field: "estimate",
					oldValue: "1",
					newValue: "8",
					createdAt: at(d2, 9),
				},
			],
		);
		// Taken out on day 3.
		await seed(
			{ title: "Removed", state: "Todo", cycleId: null, estimate: 4 },
			[
				created,
				joined,
				{
					field: "cycle",
					oldValue: "Burnup",
					metadata: { oldCycleId: cycle.id, newCycleId: null },
					createdAt: at(d2, 11),
				},
			],
		);
		// Logged before cycle changes carried ids: only the name says which cycle.
		await seed({ title: "Legacy", state: "Todo", cycleId: null, estimate: 1 }, [
			created,
			{ field: "cycle", newValue: "Burnup", createdAt: before + 1 },
			{ field: "cycle", oldValue: "Burnup", createdAt: at(d1, 14) },
		]);
		// In another cycle of the project the whole time.
		const other = await admin.client.cycles.create(
			newCycle("Unrelated", window(), OTHER_PROJECT),
		);
		await seed(
			{ title: "Unrelated", state: "Done", cycleId: other.id, estimate: 40 },
			[
				created,
				{
					field: "cycle",
					newValue: "Unrelated",
					metadata: { oldCycleId: null, newCycleId: other.id },
					createdAt: before + 1,
				},
			],
		);

		expect(await member.client.cycles.burnup({ id: cycle.id })).toEqual({
			unit: "points",
			days: [
				{ day: d0, scope: 14, completed: 0 },
				{ day: d1, scope: 15, completed: 3 },
				{ day: d2, scope: 18, completed: 8 },
				{ day: today, scope: 18, completed: 8 },
			],
		});
	});

	test("counts items when nothing is estimated, through the last day", async () => {
		const [d0, d1, d2] = [day(-50), day(-49), day(-48)] as [
			string,
			string,
			string,
		];
		const cycle = await admin.client.cycles.create(
			newCycle("Unestimated", { startDate: d0, endDate: d2 }, OTHER_PROJECT),
		);
		const joined = {
			field: "cycle",
			newValue: "Unestimated",
			metadata: { oldCycleId: null, newCycleId: cycle.id },
			createdAt: at(day(-60), 9),
		};
		await seed(
			{ title: "Count 1", state: "Done", cycleId: cycle.id, estimate: null },
			[
				joined,
				{
					field: "status",
					oldValue: states[OTHER_PROJECT]?.Todo,
					createdAt: at(d1, 12),
				},
			],
		);
		await seed(
			{ title: "Count 2", state: "Todo", cycleId: cycle.id, estimate: null },
			[joined],
		);

		expect(await member.client.cycles.burnup({ id: cycle.id })).toEqual({
			unit: "items",
			days: [
				{ day: d0, scope: 2, completed: 0 },
				{ day: d1, scope: 2, completed: 1 },
				{ day: d2, scope: 2, completed: 1 },
			],
		});
	});

	test("is empty for an upcoming cycle", async () => {
		const cycle = await admin.client.cycles.create(newCycle("Not yet"));
		const issue = await member.client.issue.create({
			...newIssue("Planned"),
			cycleId: cycle.id,
			estimate: 3,
		});
		expect(issue.cycleId).toBe(cycle.id);
		expect(await member.client.cycles.burnup({ id: cycle.id })).toEqual({
			unit: "items",
			days: [],
		});
	});

	test("a private project's burn-up looks missing to people who can't read it", async () => {
		const cycle = await admin.client.cycles.create(
			newCycle("Secret burn-up", window(), PRIVATE_PROJECT),
		);
		await expectCode(
			outsider.client.cycles.burnup({ id: cycle.id }),
			"NOT_FOUND",
		);
		await expectCode(
			outsider.client.cycles.burnup({ id: "never-existed" }),
			"NOT_FOUND",
		);
		expect((await member.client.cycles.burnup({ id: cycle.id })).days).toEqual(
			[],
		);
	});

	test("cycle changes log the cycle ids", async () => {
		const a = await admin.client.cycles.create(newCycle("Id A"));
		const b = await admin.client.cycles.create(newCycle("Id B"));
		const issue = await member.client.issue.create({
			...newIssue("Tracked"),
			cycleId: a.id,
		});
		await member.client.issue.update({ id: issue.id, cycleId: b.id });
		await activityOf(issue.id, 2);

		const rows = (await sql`
			SELECT oldValue, newValue,
				json_extract(metadata, '$.oldCycleId') AS oldCycleId,
				json_extract(metadata, '$.newCycleId') AS newCycleId
			FROM activity_logs
			WHERE entityId = ${issue.id} AND field = 'cycle'
			ORDER BY createdAt, rowid
		`) as Record<string, string | null>[];
		expect(rows).toEqual([
			{ oldValue: null, newValue: "Id A", oldCycleId: null, newCycleId: a.id },
			{
				oldValue: "Id A",
				newValue: "Id B",
				oldCycleId: a.id,
				newCycleId: b.id,
			},
		]);
	});
});
