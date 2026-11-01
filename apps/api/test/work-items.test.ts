import { beforeAll, describe, expect, test } from "bun:test";
import { createRouterClient } from "@orpc/server";

// Imported dynamically so setup.ts points the database at a temp file first.
await import("./setup");
const { Auth } = await import("@smelp/auth");
const { DB } = await import("@smelp/db");
const { router } = await import("../src/router");

const sql = new DB().sqlite;
const auth = new Auth();

const WORKSPACE = "work_item_tests";
const PROJECT = "WIT";
const OTHER_PROJECT = "OTH";

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
		`wi-${name}-${userCount}@example.test`,
		name,
		`wi-${name}-${userCount}`,
		"correct-horse-battery",
	);
	const headers = new Headers({
		cookie: `auth_session=${session.authSessionToken}`,
	});
	return {
		id: user.id,
		displayName: user.displayName,
		client: createRouterClient(router, {
			context: { headers, ip: "198.51.100.9" },
		}),
	};
}
type User = Awaited<ReturnType<typeof createUser>>;

async function addMember(spaceId: string, userId: string, role: string) {
	const member = {
		id: crypto.randomUUID(),
		spaceId,
		userId,
		role,
		createdAt: Date.now(),
	};
	await sql`INSERT INTO auth_space_member ${sql(member)}`;
}

let admin: User;
let member: User;
let guest: User;
let outsider: User;
let wsMember: User;
let stateIds: string[];

const newIssue = (title = "A work item") => ({
	title,
	description: "",
	state: first(stateIds),
	type: "task",
	workspaceId: WORKSPACE,
	projectId: PROJECT,
});

beforeAll(async () => {
	admin = await createUser("admin");
	member = await createUser("member");
	guest = await createUser("guest");
	outsider = await createUser("outsider");
	wsMember = await createUser("wsmember");

	await admin.client.workspace.create({ name: "Work item tests" });
	for (const id of [PROJECT, OTHER_PROJECT]) {
		await admin.client.project.create({
			id,
			name: `Project ${id}`,
			description: "",
			access: "public",
			icon: "AppWindowIcon",
			workspaceId: WORKSPACE,
		});
	}
	for (const user of [member, guest, wsMember]) {
		await addMember(WORKSPACE, user.id, "member");
	}
	await addMember(PROJECT, member.id, "member");
	await addMember(PROJECT, guest.id, "guest");

	const states = await admin.client.states.find({ projectId: PROJECT });
	stateIds = states.map((state) => state.id);
});

describe("editing work items", () => {
	test("records who created and last changed a work item", async () => {
		const created = await admin.client.issue.create(newIssue());
		expect(created.createdBy).toBe(admin.id);

		await member.client.issue.update({ id: created.id, title: "  Renamed  " });
		const issue = await member.client.issue.find({ issueId: created.id });

		expect(issue.title).toBe("Renamed");
		expect(issue.createdByName).toBe(admin.displayName);
		expect(issue.updatedByName).toBe(member.displayName);
	});

	test("changes only the fields it is given", async () => {
		const created = await member.client.issue.create({
			...newIssue("Keep me"),
			description: "Keep this too",
		});
		const updated = await member.client.issue.update({
			id: created.id,
			assignee: member.id,
		});
		expect(updated).toMatchObject({
			title: "Keep me",
			description: "Keep this too",
			state: first(stateIds),
			assignee: member.id,
		});

		const cleared = await member.client.issue.update({
			id: created.id,
			assignee: null,
		});
		expect(cleared.assignee).toBeNull();
	});

	test("an update that changes nothing logs nothing", async () => {
		const created = await member.client.issue.create(newIssue("Same"));
		await Bun.sleep(5);
		const same = await member.client.issue.update({
			id: created.id,
			title: "Same",
		});
		expect(same.updatedAt).toBe(created.updatedAt);
	});

	test("rejects an empty title", async () => {
		const { id } = await member.client.issue.create(newIssue());
		await expectCode(
			member.client.issue.update({ id, title: "   " }),
			"BAD_REQUEST",
		);
	});

	test("only assigns to project members", async () => {
		const { id } = await member.client.issue.create(newIssue());
		await expectCode(
			member.client.issue.update({ id, assignee: wsMember.id }),
			"BAD_REQUEST",
		);
		await expectCode(
			member.client.issue.create({ ...newIssue(), assignee: outsider.id }),
			"BAD_REQUEST",
		);
	});

	test("guests and outsiders can't edit or delete", async () => {
		const { id } = await member.client.issue.create(newIssue());
		for (const user of [guest, outsider, wsMember]) {
			await expectCode(
				user.client.issue.update({ id, title: "Nope" }),
				"FORBIDDEN",
			);
			await expectCode(user.client.issue.delete({ id }), "FORBIDDEN");
		}
	});

	test("deleting removes the work item and its comments", async () => {
		const { id } = await member.client.issue.create(newIssue());
		await member.client.comments.create({ issueId: id, body: "Hello" });

		await member.client.issue.delete({ id });

		await expectCode(member.client.issue.find({ issueId: id }), "NOT_FOUND");
		const comments = await sql`SELECT id FROM comment WHERE issueId = ${id}`;
		expect(comments.length).toBe(0);
	});

	test("numbers aren't reused after a delete", async () => {
		const deleted = await member.client.issue.create(newIssue());
		await member.client.issue.delete({ id: deleted.id });
		const next = await member.client.issue.create(newIssue());
		expect(next.id).not.toBe(deleted.id);
	});
});

describe("comments", () => {
	let issueId: string;

	beforeAll(async () => {
		issueId = (await member.client.issue.create(newIssue())).id;
	});

	test("members can comment and everyone in the project can read", async () => {
		await member.client.comments.create({ issueId, body: "  First!  " });
		const comments = await guest.client.comments.find({ issueId });
		expect(first(comments)).toMatchObject({
			body: "First!",
			authorName: member.displayName,
		});
	});

	test("rejects empty comments", () =>
		expectCode(
			member.client.comments.create({ issueId, body: "   " }),
			"BAD_REQUEST",
		));

	test("guests can comment and delete their own comments", async () => {
		const comment = await guest.client.comments.create({
			issueId,
			body: "A guest's view",
		});
		expect(comment.authorId).toBe(guest.id);

		await guest.client.comments.delete({ id: comment.id });
	});

	test("guests are still read-only for the work item itself", () =>
		expectCode(
			guest.client.issue.update({ id: issueId, title: "Nope" }),
			"FORBIDDEN",
		));

	test("people outside the project can't comment", async () => {
		for (const user of [outsider, wsMember]) {
			await expectCode(
				user.client.comments.create({ issueId, body: "Hi" }),
				"FORBIDDEN",
			);
		}
	});

	test("outsiders can't read comments", () =>
		expectCode(outsider.client.comments.find({ issueId }), "FORBIDDEN"));

	test("authors and project admins can delete, others can't", async () => {
		const mine = await member.client.comments.create({ issueId, body: "a" });
		const another = await member.client.comments.create({ issueId, body: "b" });

		await expectCode(
			guest.client.comments.delete({ id: mine.id }),
			"FORBIDDEN",
		);
		await expectCode(
			outsider.client.comments.delete({ id: mine.id }),
			"FORBIDDEN",
		);

		await member.client.comments.delete({ id: mine.id });
		await admin.client.comments.delete({ id: another.id });
	});
});

describe("activity", () => {
	test("lists an issue's changes with who made them", async () => {
		const { id } = await member.client.issue.create(newIssue());
		await member.client.issue.update({ id, state: first(stateIds.slice(1)) });
		await member.client.issue.update({ id, assignee: member.id });
		await member.client.issue.update({ id, description: "Secret plans" });
		await Bun.sleep(30);

		const activity = await guest.client.activity.findForIssue({ issueId: id });

		expect(activity.map((entry) => entry.action)).toEqual([
			"created",
			"status_changed",
			"assigned",
			"issue.updated",
		]);
		expect(first(activity).actorName).toBe(member.displayName);
		expect(JSON.stringify(activity)).not.toContain("Secret plans");
	});

	test("outsiders can't read activity", async () => {
		const { id } = await member.client.issue.create(newIssue());
		await expectCode(
			outsider.client.activity.findForIssue({ issueId: id }),
			"FORBIDDEN",
		);
	});
});

describe("my work", () => {
	test("lists open work assigned to me in that workspace", async () => {
		const states = await member.client.states.find({ projectId: PROJECT });
		const done = states.find((state) => state.group === "completed");
		if (!done) throw new Error("Expected a completed state");

		const open = await member.client.issue.create({
			...newIssue("Open one"),
			assignee: member.id,
		});
		const closed = await member.client.issue.create({
			...newIssue("Closed one"),
			assignee: member.id,
			state: done.id,
		});
		const someoneElses = await member.client.issue.create({
			...newIssue("Not mine"),
			assignee: admin.id,
		});

		const ids = (
			await member.client.issues.findMine({ workspaceId: WORKSPACE })
		).map((issue) => issue.id);

		expect(ids).toContain(open.id);
		expect(ids).not.toContain(closed.id);
		expect(ids).not.toContain(someoneElses.id);
	});

	test("outsiders can't list a workspace's work", () =>
		expectCode(
			outsider.client.issues.findMine({ workspaceId: WORKSPACE }),
			"FORBIDDEN",
		));
});

describe("project settings", () => {
	test("admins can edit a project, others can't", async () => {
		const updated = await admin.client.project.update({
			projectId: PROJECT,
			name: "Renamed project",
			description: "New",
			icon: "Briefcase01Icon",
		});
		expect(updated).toMatchObject({
			name: "Renamed project",
			description: "New",
			access: "public",
		});

		for (const user of [member, guest, outsider]) {
			await expectCode(
				user.client.project.update({ projectId: PROJECT, name: "Nope" }),
				"FORBIDDEN",
			);
		}
	});
});

describe("states", () => {
	const statesOf = (projectId: string) =>
		admin.client.states.find({ projectId });

	test("new projects keep their states in workflow order", async () => {
		const states = await statesOf(OTHER_PROJECT);
		expect(states.map((state) => state.name)).toEqual([
			"Backlog",
			"Todo",
			"In Progress",
			"Done",
		]);
	});

	test("admins can add, edit and reorder states", async () => {
		const created = await admin.client.state.create({
			projectId: OTHER_PROJECT,
			name: "In Review",
			color: "#336699",
			group: "started",
		});
		expect(created.position).toBe(4);

		const updated = await admin.client.state.update({
			id: created.id,
			name: "Reviewing",
		});
		expect(updated).toMatchObject({ name: "Reviewing", color: "#336699" });

		const ids = (await statesOf(OTHER_PROJECT)).map((state) => state.id);
		const reversed = [...ids].reverse();
		await admin.client.state.reorder({
			projectId: OTHER_PROJECT,
			stateIds: reversed,
		});
		expect((await statesOf(OTHER_PROJECT)).map((state) => state.id)).toEqual(
			reversed,
		);
		await admin.client.state.reorder({
			projectId: OTHER_PROJECT,
			stateIds: ids,
		});
	});

	test("reorder must list each state once", async () => {
		const ids = (await statesOf(OTHER_PROJECT)).map((state) => state.id);
		await expectCode(
			admin.client.state.reorder({
				projectId: OTHER_PROJECT,
				stateIds: ids.slice(1),
			}),
			"BAD_REQUEST",
		);
		await expectCode(
			admin.client.state.reorder({
				projectId: OTHER_PROJECT,
				stateIds: [first(ids), first(ids), ...ids.slice(2)],
			}),
			"BAD_REQUEST",
		);
	});

	test("rejects a color that isn't a hex value", () =>
		expectCode(
			admin.client.state.create({
				projectId: OTHER_PROJECT,
				name: "Bad",
				color: "red;background:url(x)",
				group: "started",
			}),
			"BAD_REQUEST",
		));

	test("the default can move but not be cleared or deleted", async () => {
		const states = await statesOf(OTHER_PROJECT);
		const current = states.find((state) => state.isDefault);
		const other = states.find((state) => !state.isDefault);
		if (!current || !other) throw new Error("Expected default and other");

		await expectCode(
			admin.client.state.delete({ id: current.id, moveToStateId: other.id }),
			"BAD_REQUEST",
		);

		await admin.client.state.update({ id: other.id, isDefault: true });
		const defaults = (await statesOf(OTHER_PROJECT)).filter(
			(state) => state.isDefault,
		);
		expect(defaults.map((state) => state.id)).toEqual([other.id]);

		await admin.client.state.update({ id: current.id, isDefault: true });
	});

	test("deleting moves its work items to the chosen state", async () => {
		const target = first(await statesOf(OTHER_PROJECT));
		const doomed = await admin.client.state.create({
			projectId: OTHER_PROJECT,
			name: "Doomed",
			color: "#000000",
			group: "started",
		});
		const issue = await admin.client.issue.create({
			...newIssue(),
			projectId: OTHER_PROJECT,
			state: doomed.id,
		});

		await admin.client.state.delete({
			id: doomed.id,
			moveToStateId: target.id,
		});

		const moved = await admin.client.issue.find({ issueId: issue.id });
		expect(moved.state).toBe(target.id);
	});

	test("can't move work items to itself or another project", async () => {
		const states = await statesOf(OTHER_PROJECT);
		const victim = first(states.filter((state) => !state.isDefault));
		const foreign = first(await statesOf(PROJECT));

		await expectCode(
			admin.client.state.delete({ id: victim.id, moveToStateId: victim.id }),
			"BAD_REQUEST",
		);
		await expectCode(
			admin.client.state.delete({ id: victim.id, moveToStateId: foreign.id }),
			"BAD_REQUEST",
		);
	});

	test("members and outsiders can't manage states", async () => {
		const state = first(await statesOf(PROJECT));
		const add = {
			projectId: PROJECT,
			name: "Nope",
			color: "#000000",
			group: "started" as const,
		};
		for (const user of [member, guest, outsider]) {
			await expectCode(user.client.state.create(add), "FORBIDDEN");
			await expectCode(
				user.client.state.update({ id: state.id, name: "Nope" }),
				"FORBIDDEN",
			);
			await expectCode(
				user.client.state.reorder({ projectId: PROJECT, stateIds: [] }),
				"FORBIDDEN",
			);
		}
	});
});
