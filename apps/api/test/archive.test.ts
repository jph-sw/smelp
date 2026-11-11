import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createRouterClient } from "@orpc/server";

// Imported dynamically so setup.ts points the database at a temp file first.
await import("./setup");
const { Auth } = await import("@smelp/auth");
const { DB } = await import("@smelp/db");
const { router } = await import("../src/router");

const sql = new DB().sqlite;
const auth = new Auth();

const WORKSPACE = "archive_tests";
const PROJECT = "ARC";
const OTHER_PROJECT = "LIVE";

function first<T>(items: T[]): T {
	const [item] = items;
	if (item === undefined) throw new Error("Expected at least one item");
	return item;
}

const expectArchived = (call: Promise<unknown>) =>
	expect(call).rejects.toMatchObject({
		code: "FORBIDDEN",
		message: "This project is archived",
	});

let userCount = 0;
async function createUser(name: string) {
	userCount += 1;
	const { session, user } = await auth.signUp(
		`ar-${name}-${userCount}@example.test`,
		name,
		`ar-${name}-${userCount}`,
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
let joiner: User;
let stateIds: string[];
let issueId: string;
let commentId: string;

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
	joiner = await createUser("joiner");

	await admin.client.workspace.create({ name: "Archive tests" });
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
	for (const user of [member, guest, joiner]) {
		await addMember(WORKSPACE, user.id, "member");
	}
	await addMember(PROJECT, member.id, "member");
	await addMember(PROJECT, guest.id, "guest");
	await addMember(OTHER_PROJECT, member.id, "member");

	const states = await admin.client.states.find({ projectId: PROJECT });
	stateIds = states.map((state) => state.id);

	const issue = await member.client.issue.create({
		...newIssue("Assigned to member"),
		assignee: member.id,
	});
	issueId = issue.id;
	commentId = (
		await member.client.comments.create({ issueId, body: "Before archiving" })
	).id;
});

async function isArchived() {
	const rows = (await sql`
		SELECT archivedAt FROM project WHERE id = ${PROJECT}
	`) as { archivedAt: number | null }[];
	return first(rows).archivedAt !== null;
}

async function archive() {
	if (!(await isArchived())) {
		await admin.client.project.archive({ projectId: PROJECT });
	}
}

async function unarchive() {
	if (await isArchived()) {
		await admin.client.project.unarchive({ projectId: PROJECT });
	}
}

describe("who can archive", () => {
	beforeEach(unarchive);

	test("project members and guests cannot archive or unarchive", async () => {
		for (const user of [member, guest, joiner]) {
			await expect(
				user.client.project.archive({ projectId: PROJECT }),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
		}

		await admin.client.project.archive({ projectId: PROJECT });

		for (const user of [member, guest, joiner]) {
			await expect(
				user.client.project.unarchive({ projectId: PROJECT }),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
		}
	});

	test("a project admin can archive and unarchive, and it is recorded", async () => {
		const archived = await admin.client.project.archive({
			projectId: PROJECT,
		});
		expect(archived.archivedAt).toBeNumber();
		expect(archived.archivedBy).toBe(admin.id);

		await expect(
			admin.client.project.archive({ projectId: PROJECT }),
		).rejects.toMatchObject({ code: "CONFLICT" });

		const restored = await admin.client.project.unarchive({
			projectId: PROJECT,
		});
		expect(restored.archivedAt).toBeNull();
		expect(restored.archivedBy).toBeNull();

		await expect(
			admin.client.project.unarchive({ projectId: PROJECT }),
		).rejects.toMatchObject({ code: "CONFLICT" });

		// The activity log is written by an event listener, after the call returns.
		let actions: string[] = [];
		for (let attempt = 0; attempt < 20 && actions.length < 2; attempt++) {
			await Bun.sleep(10);
			actions = (
				(await sql`
					SELECT action FROM activity_logs
					WHERE entityType = 'project' AND entityId = ${PROJECT}
						AND action IN ('project.archived', 'project.unarchived')
				`) as { action: string }[]
			).map((row) => row.action);
		}
		expect(actions).toContain("project.archived");
		expect(actions).toContain("project.unarchived");
	});
});

// Every write that changes an archived project's contents, called the way the
// web app calls it. Each one must be refused while archived and work again after.
const writes: Record<string, () => Promise<unknown>> = {
	"create a work item": () => member.client.issue.create(newIssue()),
	"update a work item": () =>
		member.client.issue.update({
			id: issueId,
			title: `Renamed ${Math.random()}`,
		}),
	"move a work item": async () => {
		const issue = await member.client.issue.find({ issueId });
		const next = stateIds.find((id) => id !== issue.state) ?? first(stateIds);
		return member.client.issue.update({ id: issueId, state: next });
	},
	"delete a work item": async () => {
		// Created through SQL, so the refusal is about deleting and not creating.
		const id = crypto.randomUUID();
		await sql`
			INSERT INTO issue (id, title, description, state, type, workspaceId, projectId, createdBy, createdAt, updatedAt)
			VALUES (${id}, 'Throwaway', '', ${first(stateIds)}, 'task', ${WORKSPACE}, ${PROJECT}, ${member.id}, 0, 0)
		`;
		return member.client.issue.delete({ id });
	},
	"comment, as a member": () =>
		member.client.comments.create({ issueId, body: "Hello" }),
	"comment, as a guest": () =>
		guest.client.comments.create({ issueId, body: "Hello" }),
	"delete a comment": async () => {
		const id = crypto.randomUUID();
		await sql`INSERT INTO comment ${sql({ id, issueId, authorId: member.id, body: "Bye", createdAt: Date.now() })}`;
		return member.client.comments.delete({ id });
	},
	"create a state": () =>
		admin.client.state.create({
			projectId: PROJECT,
			name: `S${Math.floor(Math.random() * 1e6)}`,
			color: "#123456",
			group: "started",
		}),
	"update a state": () =>
		admin.client.state.update({ id: first(stateIds), color: "#654321" }),
	"delete a state": async () => {
		const id = crypto.randomUUID();
		await sql`INSERT INTO state ${sql({ id, value: id, name: "Temp", color: "#000000", group: "started", projectId: PROJECT, isDefault: 0, position: 99 })}`;
		return admin.client.state.delete({ id, moveToStateId: first(stateIds) });
	},
	"reorder states": async () => {
		const states = await admin.client.states.find({ projectId: PROJECT });
		return admin.client.state.reorder({
			projectId: PROJECT,
			stateIds: states.map((state) => state.id).reverse(),
		});
	},
	"add a project member": async () => {
		const user = await createUser("added");
		await addMember(WORKSPACE, user.id, "member");
		return admin.client.projectMembers.add({
			projectId: PROJECT,
			userId: user.id,
			role: "member",
		});
	},
	"remove a project member": async () => {
		const user = await createUser("removed");
		const id = crypto.randomUUID();
		await sql`INSERT INTO auth_space_member ${sql({ id, spaceId: PROJECT, userId: user.id, role: "member", createdAt: Date.now() })}`;
		return admin.client.projectMembers.remove({
			projectId: PROJECT,
			memberId: id,
		});
	},
	"update project settings": () =>
		admin.client.project.update({ projectId: PROJECT, description: "New" }),
	"join the project": async () => {
		const user = await createUser("joiner");
		await addMember(WORKSPACE, user.id, "member");
		return user.client.project.join({ projectId: PROJECT });
	},
};

describe("an archived project is read-only", () => {
	for (const [name, write] of Object.entries(writes)) {
		test(`refuses to ${name}, and allows it again after unarchiving`, async () => {
			await archive();
			await expectArchived(write());

			await unarchive();
			await write();
		});
	}

	test("the original comment survived every refused delete", async () => {
		const comments = await member.client.comments.find({ issueId });
		expect(comments.map((comment) => comment.id)).toContain(commentId);
	});

	test("reading still works", async () => {
		await archive();

		const project = await guest.client.project.find({ projectId: PROJECT });
		expect(project.archivedAt).toBeNumber();
		expect(
			(await guest.client.issues.find({ projectId: PROJECT })).length,
		).toBeGreaterThan(0);
		await guest.client.issue.find({ issueId });
		await guest.client.states.find({ projectId: PROJECT });
		await guest.client.comments.find({ issueId });
		await guest.client.projectMembers.find({ projectId: PROJECT });
		await guest.client.activity.findForIssue({ issueId });
		await admin.client.projectMembers.findAvailable({ projectId: PROJECT });
	});

	test("an archived project can still be deleted", async () => {
		await admin.client.project.create({
			id: "GONE",
			name: "Project GONE",
			description: "",
			access: "public",
			icon: "AppWindowIcon",
			workspaceId: WORKSPACE,
		});
		await admin.client.project.archive({ projectId: "GONE" });
		await admin.client.project.delete({ projectId: "GONE" });
		const rows = await sql`SELECT id FROM project WHERE id = 'GONE'`;
		expect(rows).toHaveLength(0);
	});
});

describe("lists", () => {
	test("projects.find flags archived projects", async () => {
		await archive();
		const projects = await member.client.projects.find({
			workspaceId: WORKSPACE,
		});
		const byId = Object.fromEntries(projects.map((p) => [p.id, p]));
		expect(byId[PROJECT]?.isArchived).toBe(true);
		expect(byId[OTHER_PROJECT]?.isArchived).toBe(false);

		await unarchive();
		const after = await member.client.projects.find({ workspaceId: WORKSPACE });
		expect(after.find((p) => p.id === PROJECT)?.isArchived).toBe(false);
	});

	test("my work leaves out items from archived projects", async () => {
		await unarchive();
		await member.client.issue.create({
			...newIssue("In the live project"),
			projectId: OTHER_PROJECT,
			state: first(
				await member.client.states.find({ projectId: OTHER_PROJECT }),
			).id,
			assignee: member.id,
		});

		const before = await member.client.issues.findMine({
			workspaceId: WORKSPACE,
		});
		expect(before.map((issue) => issue.projectId)).toContain(PROJECT);

		await archive();
		const mine = await member.client.issues.findMine({
			workspaceId: WORKSPACE,
		});
		expect(mine.map((issue) => issue.projectId)).not.toContain(PROJECT);
		expect(mine.map((issue) => issue.projectId)).toContain(OTHER_PROJECT);

		await unarchive();
	});
});
