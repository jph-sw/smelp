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
		});
		const listed = await member.client.cycles.find({ projectId: PROJECT });
		expect(listed.find((c) => c.id === cycle.id)?.progress.total).toBe(5);
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
