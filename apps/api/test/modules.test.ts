import { beforeAll, describe, expect, test } from "bun:test";
import { createRouterClient } from "@orpc/server";

// Imported dynamically so setup.ts points the database at a temp file first.
await import("./setup");
const { Auth } = await import("@smelp/auth");
const { DB } = await import("@smelp/db");
const { router } = await import("../src/router");

const sql = new DB().sqlite;
const auth = new Auth();

const WORKSPACE = "module_tests";
const PROJECT = "MDA";
const OTHER_PROJECT = "MDB";
const PRIVATE_PROJECT = "MDP";

function first<T>(items: T[]): T {
	const [item] = items;
	if (item === undefined) throw new Error("Expected at least one item");
	return item;
}

const expectCode = (call: Promise<unknown>, code: string) =>
	expect(call).rejects.toMatchObject({ code });

let userCount = 0;
async function createUser(name: string) {
	userCount += 1;
	const { session, user } = await auth.signUp(
		`mod-${name}-${userCount}@example.test`,
		name,
		`mod-${name}-${userCount}`,
		"correct-horse-battery",
	);
	const headers = new Headers({
		cookie: `auth_session=${session.authSessionToken}`,
	});
	return {
		id: user.id,
		client: createRouterClient(router, {
			context: { headers, ip: "198.51.100.12" },
		}),
	};
}
type User = Awaited<ReturnType<typeof createUser>>;

let admin: User;
let member: User;
let guest: User;
let outsider: User;
const stateIds: Record<string, string[]> = {};
const stateGroups: Record<string, string> = {};

async function addMember(spaceId: string, userId: string, role: string) {
	await sql`INSERT INTO auth_space_member ${sql({
		id: crypto.randomUUID(),
		spaceId,
		userId,
		role,
		createdAt: Date.now(),
	})}`;
}

const newIssue = (title: string, state?: string, projectId = PROJECT) => ({
	title,
	description: "",
	state: state ?? first(stateIds[projectId] ?? []),
	workspaceId: WORKSPACE,
	projectId,
});

const stateInGroup = (group: string, projectId = PROJECT) =>
	first((stateIds[projectId] ?? []).filter((id) => stateGroups[id] === group));

// Events are saved a moment after the request returns, so wait for them.
async function activityRows(entityId: string, action: string, count = 1) {
	for (let attempt = 0; attempt < 100; attempt++) {
		const rows = (await sql`
			SELECT field, oldValue, newValue FROM activity_logs
			WHERE entityId = ${entityId} AND action = ${action}
			ORDER BY createdAt, rowid
		`) as {
			field: string | null;
			oldValue: string | null;
			newValue: string | null;
		}[];
		if (rows.length >= count) return rows;
		await Bun.sleep(10);
	}
	throw new Error(`No ${action} activity for ${entityId}`);
}

beforeAll(async () => {
	admin = await createUser("admin");
	member = await createUser("member");
	guest = await createUser("guest");
	outsider = await createUser("outsider");

	await admin.client.workspace.create({ name: "Module tests" });
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
		const states = await admin.client.states.find({ projectId: id });
		stateIds[id] = states.map((state) => state.id);
		for (const state of states) stateGroups[state.id] = state.group;
	}
	for (const user of [member, guest, outsider]) {
		await addMember(WORKSPACE, user.id, "member");
	}
	await addMember(PROJECT, member.id, "member");
	await addMember(PROJECT, guest.id, "guest");
	await addMember(OTHER_PROJECT, member.id, "member");
});

describe("modules", () => {
	test("admins create, list, rename and describe modules", async () => {
		const created = await admin.client.modules.create({
			projectId: PROJECT,
			name: "  Checkout  ",
			description: "Everything for checkout",
			leadId: member.id,
			targetDate: "2026-12-31",
		});
		expect(created?.name).toBe("Checkout");
		expect(created?.leadId).toBe(member.id);
		expect(created?.leadName).toBe(`mod-member-${2}`);
		expect(created?.progress.total).toBe(0);

		const updated = await admin.client.modules.update({
			id: created?.id ?? "",
			name: "Checkout v2",
			targetDate: null,
		});
		expect(updated?.name).toBe("Checkout v2");
		expect(updated?.targetDate).toBeNull();
		expect(updated?.description).toBe("Everything for checkout");

		const listed = await member.client.modules.find({ projectId: PROJECT });
		expect(listed.map((item) => item.name)).toContain("Checkout v2");
		const one = await guest.client.modules.get({ id: created?.id ?? "" });
		expect(one.id).toBe(created?.id);
	});

	test("refuses duplicate names, ignoring case, but allows them in other projects", async () => {
		await admin.client.modules.create({ projectId: PROJECT, name: "Billing" });
		await expectCode(
			admin.client.modules.create({ projectId: PROJECT, name: "BILLING" }),
			"CONFLICT",
		);
		await admin.client.modules.create({
			projectId: OTHER_PROJECT,
			name: "Billing",
		});
		const second = await admin.client.modules.create({
			projectId: PROJECT,
			name: "Billing 2",
		});
		await expectCode(
			admin.client.modules.update({ id: second?.id ?? "", name: "billing" }),
			"CONFLICT",
		);
	});

	test("validates names, dates and empty ids", async () => {
		await expectCode(
			admin.client.modules.create({ projectId: PROJECT, name: "   " }),
			"BAD_REQUEST",
		);
		await expectCode(
			admin.client.modules.create({
				projectId: PROJECT,
				name: "Bad date",
				targetDate: "2026-02-31",
			}),
			"BAD_REQUEST",
		);
		const created = await admin.client.modules.create({
			projectId: PROJECT,
			name: "Validation",
		});
		await expectCode(
			admin.client.modules.update({ id: created?.id ?? "", leadId: "" }),
			"BAD_REQUEST",
		);
		await expectCode(admin.client.modules.update({ id: "" }), "BAD_REQUEST");
	});

	test("the lead must be a project member", async () => {
		await expectCode(
			admin.client.modules.create({
				projectId: PROJECT,
				name: "Lead check",
				leadId: outsider.id,
			}),
			"BAD_REQUEST",
		);
		const created = await admin.client.modules.create({
			projectId: PROJECT,
			name: "Lead check",
		});
		await expectCode(
			admin.client.modules.update({
				id: created?.id ?? "",
				leadId: outsider.id,
			}),
			"BAD_REQUEST",
		);
		const set = await admin.client.modules.update({
			id: created?.id ?? "",
			leadId: guest.id,
		});
		expect(set?.leadId).toBe(guest.id);
		const cleared = await admin.client.modules.update({
			id: created?.id ?? "",
			leadId: null,
		});
		expect(cleared?.leadId).toBeNull();
	});

	test("a lead who leaves the project no longer shows, and edits still work", async () => {
		const created = await admin.client.modules.create({
			projectId: PROJECT,
			name: "Leaver",
			leadId: guest.id,
		});
		await sql`DELETE FROM auth_space_member WHERE spaceId = ${PROJECT} AND userId = ${guest.id}`;
		try {
			const shown = await admin.client.modules.get({ id: created?.id ?? "" });
			expect(shown.leadId).toBeNull();
			expect(shown.leadName).toBeNull();
			const renamed = await admin.client.modules.update({
				id: created?.id ?? "",
				name: "Leaver 2",
			});
			expect(renamed?.name).toBe("Leaver 2");
		} finally {
			await addMember(PROJECT, guest.id, "guest");
		}
	});

	test("members and guests can't manage modules", async () => {
		await expectCode(
			member.client.modules.create({ projectId: PROJECT, name: "Nope" }),
			"FORBIDDEN",
		);
		await expectCode(
			guest.client.modules.create({ projectId: PROJECT, name: "Nope" }),
			"FORBIDDEN",
		);
		const created = await admin.client.modules.create({
			projectId: PROJECT,
			name: "Admin only",
		});
		await expectCode(
			member.client.modules.update({ id: created?.id ?? "", name: "Mine" }),
			"FORBIDDEN",
		);
		await expectCode(
			member.client.modules.delete({ id: created?.id ?? "" }),
			"FORBIDDEN",
		);
	});

	test("a project the caller can't read looks like it doesn't exist", async () => {
		const secret = await admin.client.modules.create({
			projectId: PRIVATE_PROJECT,
			name: "Secret roadmap",
		});
		await expectCode(
			outsider.client.modules.find({ projectId: PRIVATE_PROJECT }),
			"NOT_FOUND",
		);
		await expectCode(
			outsider.client.modules.find({ projectId: "NOPE" }),
			"NOT_FOUND",
		);
		await expectCode(
			outsider.client.modules.get({ id: secret?.id ?? "" }),
			"NOT_FOUND",
		);
		await expectCode(
			outsider.client.modules.update({ id: secret?.id ?? "", name: "x" }),
			"NOT_FOUND",
		);
		await expectCode(
			outsider.client.modules.delete({ id: secret?.id ?? "" }),
			"NOT_FOUND",
		);
		await expectCode(
			outsider.client.modules.create({
				projectId: PRIVATE_PROJECT,
				name: "Sneaky",
			}),
			"NOT_FOUND",
		);
		const stillThere = await admin.client.modules.get({ id: secret?.id ?? "" });
		expect(stillThere.name).toBe("Secret roadmap");
	});
});

describe("work items in modules", () => {
	test("members assign and clear a module, and progress follows the states", async () => {
		const mod = await admin.client.modules.create({
			projectId: PROJECT,
			name: "Progress",
		});
		const id = mod?.id ?? "";
		const todo = await member.client.issue.create(
			newIssue("Todo", stateInGroup("unstarted")),
		);
		const doing = await member.client.issue.create(
			newIssue("Doing", stateInGroup("started")),
		);
		const done = await member.client.issue.create(
			newIssue("Done", stateInGroup("completed")),
		);
		const backlog = await member.client.issue.create(
			newIssue("Backlog", stateInGroup("backlog")),
		);
		for (const item of [todo, doing, done, backlog]) {
			const updated = await member.client.issue.update({
				id: item.id,
				moduleId: id,
			});
			expect(updated.moduleId).toBe(id);
		}

		const progress = (await member.client.modules.get({ id })).progress;
		expect(progress).toEqual({
			total: 4,
			done: 1,
			inProgress: 1,
			notStarted: 2,
			cancelled: 0,
			points: { total: 0, done: 0 },
		});

		// Moving an item to another state updates the counts.
		await member.client.issue.update({
			id: todo.id,
			state: stateInGroup("completed"),
		});
		const after = (await member.client.modules.get({ id })).progress;
		expect(after.done).toBe(2);
		expect(after.notStarted).toBe(1);

		const cleared = await member.client.issue.update({
			id: doing.id,
			moduleId: null,
		});
		expect(cleared.moduleId).toBeNull();
		expect((await member.client.modules.get({ id })).progress.total).toBe(3);

		const listed = await member.client.issues.find({ projectId: PROJECT });
		expect(
			listed.filter((item) => item.moduleId === id).map((item) => item.id),
		).not.toContain(doing.id);
	});

	test("totals the points of its items, leaving cancelled ones out", async () => {
		const mod = await admin.client.modules.create({
			projectId: PROJECT,
			name: "Points",
		});
		const moduleId = mod?.id ?? "";
		const empty = await admin.client.modules.create({
			projectId: PROJECT,
			name: "No points",
		});
		const wontDo = await admin.client.state.create({
			projectId: PROJECT,
			name: "Won't do",
			color: "#999999",
			group: "cancelled",
		});
		for (const [estimate, state] of [
			[3, stateInGroup("completed")],
			[5, stateInGroup("started")],
			[8, stateInGroup("unstarted")],
			[13, wontDo.id],
		] as const) {
			await member.client.issue.create({
				...newIssue(`${estimate} points`, state),
				moduleId,
				estimate,
			});
		}

		const progress = (await member.client.modules.get({ id: moduleId }))
			.progress;
		expect(progress.points).toEqual({ total: 16, done: 3 });
		const none = (await member.client.modules.get({ id: empty?.id ?? "" }))
			.progress;
		expect(none.points).toEqual({ total: 0, done: 0 });
	});

	test("refuses a module from another project or one that doesn't exist", async () => {
		const elsewhere = await admin.client.modules.create({
			projectId: OTHER_PROJECT,
			name: "Elsewhere",
		});
		const item = await member.client.issue.create(newIssue("Stays put"));
		await expectCode(
			member.client.issue.update({
				id: item.id,
				moduleId: elsewhere?.id ?? "",
			}),
			"BAD_REQUEST",
		);
		await expectCode(
			member.client.issue.update({ id: item.id, moduleId: "missing" }),
			"BAD_REQUEST",
		);
		await expectCode(
			member.client.issue.update({ id: item.id, moduleId: "" }),
			"BAD_REQUEST",
		);
		const unchanged = await member.client.issue.find({ issueId: item.id });
		expect(unchanged.moduleId).toBeNull();
	});

	test("guests can't assign modules", async () => {
		const mod = await admin.client.modules.create({
			projectId: PROJECT,
			name: "Read only for guests",
		});
		const item = await member.client.issue.create(newIssue("Guarded"));
		await expectCode(
			guest.client.issue.update({ id: item.id, moduleId: mod?.id ?? "" }),
			"FORBIDDEN",
		);
	});

	test("an item in a private project can't be changed by an outsider", async () => {
		const mod = await admin.client.modules.create({
			projectId: PRIVATE_PROJECT,
			name: "Private module",
		});
		const item = await admin.client.issue.create(
			newIssue("Private item", undefined, PRIVATE_PROJECT),
		);
		await expectCode(
			outsider.client.issue.update({ id: item.id, moduleId: mod?.id ?? "" }),
			"FORBIDDEN",
		);
	});

	test("deleting a module clears it from its items and logs it", async () => {
		const mod = await admin.client.modules.create({
			projectId: PROJECT,
			name: "Doomed",
		});
		const id = mod?.id ?? "";
		const a = await member.client.issue.create(newIssue("Doomed A"));
		const b = await member.client.issue.create(newIssue("Doomed B"));
		await member.client.issue.update({ id: a.id, moduleId: id });
		await member.client.issue.update({ id: b.id, moduleId: id });

		await admin.client.modules.delete({ id });
		await expectCode(admin.client.modules.get({ id }), "NOT_FOUND");
		await expectCode(admin.client.modules.delete({ id }), "NOT_FOUND");

		for (const item of [a, b]) {
			const reloaded = await member.client.issue.find({ issueId: item.id });
			expect(reloaded.moduleId).toBeNull();
			const rows = await activityRows(item.id, "issue.updated", 2);
			const moduleRows = rows.filter((row) => row.field === "module");
			expect(moduleRows.map((row) => [row.oldValue, row.newValue])).toEqual([
				[null, "Doomed"],
				["Doomed", null],
			]);
		}
		const deleted = await activityRows(id, "module.deleted");
		expect(deleted.length).toBe(1);
	});

	test("changing a module is logged on the item and shows in both timelines", async () => {
		const first_ = await admin.client.modules.create({
			projectId: PROJECT,
			name: "Timeline one",
		});
		const second = await admin.client.modules.create({
			projectId: PROJECT,
			name: "Timeline two",
		});
		const item = await member.client.issue.create(newIssue("Timeline"));
		await member.client.issue.update({ id: item.id, moduleId: first_?.id });
		await member.client.issue.update({ id: item.id, moduleId: second?.id });
		// Setting the same module again changes nothing, so it isn't logged.
		await member.client.issue.update({ id: item.id, moduleId: second?.id });

		await activityRows(item.id, "issue.updated", 2);
		const timeline = await member.client.activity.findForIssue({
			issueId: item.id,
		});
		const entries = timeline.filter((entry) => entry.field === "module");
		expect(entries.map((entry) => [entry.oldValue, entry.newValue])).toEqual([
			[null, "Timeline one"],
			["Timeline one", "Timeline two"],
		]);

		const feed = await admin.client.activity.findWorkspace({
			workspaceId: WORKSPACE,
		});
		const moved = feed.events.find(
			(event) =>
				event.issue?.id === item.id &&
				event.details.field === "module" &&
				event.details.to === "Timeline two",
		);
		expect(moved?.details.from).toBe("Timeline one");
	});

	test("module events never reach people who can't see the project", async () => {
		await admin.client.modules.create({
			projectId: PRIVATE_PROJECT,
			name: "Hidden from the feed",
		});
		const created = await activityRows(
			(await admin.client.modules.find({ projectId: PRIVATE_PROJECT }))[0]
				?.id ?? "",
			"module.created",
		);
		expect(created.length).toBe(1);
		const feed = await outsider.client.activity.findWorkspace({
			workspaceId: WORKSPACE,
		});
		expect(
			feed.events.some(
				(event) =>
					event.type.startsWith("module.") &&
					event.project?.id === PRIVATE_PROJECT,
			),
		).toBe(false);
	});
});

describe("creating a work item in a module", () => {
	test("stores the module and logs it by name", async () => {
		const mod = await admin.client.modules.create({
			projectId: PROJECT,
			name: "Created in",
		});
		const item = await member.client.issue.create({
			...newIssue("Born in a module"),
			moduleId: mod?.id,
		});
		expect(item.moduleId).toBe(mod?.id ?? "");

		const rows = await activityRows(item.id, "issue.updated");
		expect(rows).toEqual([
			{ field: "module", oldValue: null, newValue: "Created in" },
		]);
	});

	test("refuses a module of another project, a missing one and an empty id", async () => {
		const elsewhere = await admin.client.modules.create({
			projectId: OTHER_PROJECT,
			name: "Other project",
		});
		for (const moduleId of [elsewhere?.id ?? "", "no-such-module", ""]) {
			await expectCode(
				member.client.issue.create({ ...newIssue("Refused"), moduleId }),
				"BAD_REQUEST",
			);
		}
	});
});

describe("archived projects", () => {
	test("modules and assignments are read-only", async () => {
		const mod = await admin.client.modules.create({
			projectId: OTHER_PROJECT,
			name: "Before archive",
		});
		const item = await member.client.issue.create(
			newIssue("Before archive", undefined, OTHER_PROJECT),
		);
		await admin.client.project.archive({ projectId: OTHER_PROJECT });
		try {
			const refused = {
				code: "FORBIDDEN",
				message: "This project is archived",
			};
			await expect(
				admin.client.modules.create({ projectId: OTHER_PROJECT, name: "New" }),
			).rejects.toMatchObject(refused);
			await expect(
				admin.client.modules.update({ id: mod?.id ?? "", name: "Renamed" }),
			).rejects.toMatchObject(refused);
			await expect(
				admin.client.modules.delete({ id: mod?.id ?? "" }),
			).rejects.toMatchObject(refused);
			await expect(
				member.client.issue.update({ id: item.id, moduleId: mod?.id ?? "" }),
			).rejects.toMatchObject(refused);
			const listed = await member.client.modules.find({
				projectId: OTHER_PROJECT,
			});
			expect(listed.map((entry) => entry.id)).toContain(mod?.id ?? "");
		} finally {
			await admin.client.project.unarchive({ projectId: OTHER_PROJECT });
		}
	});
});

describe("modules next to cycles", () => {
	test("an item keeps its cycle when its module changes, and the other way round", async () => {
		const mod = await admin.client.modules.create({
			projectId: PROJECT,
			name: "With a cycle",
		});
		const cycle = await admin.client.cycles.create({
			projectId: PROJECT,
			name: "Cycle beside a module",
			startDate: "2030-01-01",
			endDate: "2030-01-14",
		});
		const item = await member.client.issue.create(newIssue("Both"));
		await member.client.issue.update({ id: item.id, cycleId: cycle.id });
		const withModule = await member.client.issue.update({
			id: item.id,
			moduleId: mod?.id,
		});
		expect(withModule.cycleId).toBe(cycle.id);
		expect(withModule.moduleId).toBe(mod?.id ?? "");

		const noCycle = await member.client.issue.update({
			id: item.id,
			cycleId: null,
		});
		expect(noCycle.cycleId).toBeNull();
		expect(noCycle.moduleId).toBe(mod?.id ?? "");

		// Each guard checks its own reference.
		await expectCode(
			member.client.issue.update({ id: item.id, cycleId: "missing" }),
			"BAD_REQUEST",
		);
		const unchanged = await member.client.issue.find({ issueId: item.id });
		expect(unchanged.moduleId).toBe(mod?.id ?? "");
	});
});
