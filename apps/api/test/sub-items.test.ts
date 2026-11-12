import { beforeAll, describe, expect, test } from "bun:test";
import { createRouterClient } from "@orpc/server";

// Imported dynamically so setup.ts points the database at a temp file first.
await import("./setup");
const { Auth } = await import("@smelp/auth");
const { DB } = await import("@smelp/db");
const { router } = await import("../src/router");

const sql = new DB().sqlite;
const auth = new Auth();

const WORKSPACE = "sub_item_tests";
const PROJECT = "SUB";
const OTHER_PROJECT = "SUO";

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
		`sub-${name}-${userCount}@example.test`,
		name,
		`sub-${name}-${userCount}`,
		"correct-horse-battery",
	);
	const headers = new Headers({
		cookie: `auth_session=${session.authSessionToken}`,
	});
	return {
		id: user.id,
		client: createRouterClient(router, {
			context: { headers, ip: "198.51.100.9" },
		}),
	};
}
type User = Awaited<ReturnType<typeof createUser>>;

let admin: User;
let member: User;
let guest: User;
const stateIds: Record<string, string[]> = {};

const newIssue = (title: string, parentId?: string, projectId = PROJECT) => ({
	title,
	description: "",
	state: first(stateIds[projectId] ?? []),
	type: "task",
	workspaceId: WORKSPACE,
	projectId,
	parentId,
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

beforeAll(async () => {
	admin = await createUser("admin");
	member = await createUser("member");
	guest = await createUser("guest");

	await admin.client.workspace.create({ name: "Sub-item tests" });
	for (const id of [PROJECT, OTHER_PROJECT]) {
		await admin.client.project.create({
			id,
			name: `Project ${id}`,
			description: "",
			access: "public",
			icon: "AppWindowIcon",
			workspaceId: WORKSPACE,
		});
		stateIds[id] = (await admin.client.states.find({ projectId: id })).map(
			(state) => state.id,
		);
	}
	for (const user of [member, guest]) {
		await addMember(WORKSPACE, user.id, "member");
	}
	await addMember(PROJECT, member.id, "member");
	await addMember(PROJECT, guest.id, "guest");
	await addMember(OTHER_PROJECT, member.id, "member");
});

describe("sub-items", () => {
	test("creates an item under a parent in the same project", async () => {
		const parent = await member.client.issue.create(newIssue("Parent"));
		const child = await member.client.issue.create(
			newIssue("Child", parent.id),
		);
		expect(child.parentId).toBe(parent.id);

		const all = await member.client.issues.find({ projectId: PROJECT });
		expect(all.filter((item) => item.parentId === parent.id).length).toBe(1);
	});

	test("refuses a missing parent or one in another project", async () => {
		const elsewhere = await member.client.issue.create(
			newIssue("Elsewhere", undefined, OTHER_PROJECT),
		);
		await expectCode(
			member.client.issue.create(newIssue("Bad", elsewhere.id)),
			"BAD_REQUEST",
		);
		await expectCode(
			member.client.issue.create(newIssue("Bad", "SUB-99999")),
			"BAD_REQUEST",
		);
		const own = await member.client.issue.create(newIssue("Own"));
		await expectCode(
			member.client.issue.update({ id: own.id, parentId: elsewhere.id }),
			"BAD_REQUEST",
		);
	});

	test("sets, changes and clears the parent of an existing item", async () => {
		const a = await member.client.issue.create(newIssue("A"));
		const b = await member.client.issue.create(newIssue("B"));
		const c = await member.client.issue.create(newIssue("C"));

		const set = await member.client.issue.update({ id: c.id, parentId: a.id });
		expect(set.parentId).toBe(a.id);
		const moved = await member.client.issue.update({
			id: c.id,
			parentId: b.id,
		});
		expect(moved.parentId).toBe(b.id);
		const cleared = await member.client.issue.update({
			id: c.id,
			parentId: null,
		});
		expect(cleared.parentId).toBeNull();
	});

	test("refuses loops", async () => {
		const a = await member.client.issue.create(newIssue("Loop A"));
		const b = await member.client.issue.create(newIssue("Loop B", a.id));
		const c = await member.client.issue.create(newIssue("Loop C", b.id));

		for (const parentId of [a.id, b.id, c.id]) {
			await expectCode(
				member.client.issue.update({ id: a.id, parentId }),
				"BAD_REQUEST",
			);
		}
		const unchanged = await member.client.issue.find({ issueId: a.id });
		expect(unchanged.parentId).toBeNull();
	});

	test("guests can't change parents", async () => {
		const parent = await member.client.issue.create(newIssue("P"));
		const child = await member.client.issue.create(newIssue("K"));
		await expectCode(
			guest.client.issue.update({ id: child.id, parentId: parent.id }),
			"FORBIDDEN",
		);
		await expectCode(
			guest.client.issue.create(newIssue("G", parent.id)),
			"FORBIDDEN",
		);
	});

	test("archived projects are read-only", async () => {
		const parent = await member.client.issue.create(newIssue("Arch parent"));
		const child = await member.client.issue.create(newIssue("Arch child"));
		await admin.client.project.archive({ projectId: PROJECT });
		try {
			await expectCode(
				member.client.issue.update({ id: child.id, parentId: parent.id }),
				"FORBIDDEN",
			);
			await expectCode(
				member.client.issue.create(newIssue("New", parent.id)),
				"FORBIDDEN",
			);
		} finally {
			await admin.client.project.unarchive({ projectId: PROJECT });
		}
	});

	test("logs parent changes; deleting a parent detaches its children", async () => {
		const parent = await member.client.issue.create(newIssue("Log parent"));
		const child = await member.client.issue.create(newIssue("Log child"));
		await member.client.issue.update({ id: child.id, parentId: parent.id });
		await member.client.issue.update({ id: child.id, parentId: null });
		await member.client.issue.update({ id: child.id, parentId: parent.id });
		await Bun.sleep(30);

		const activity = await member.client.activity.findForIssue({
			issueId: child.id,
		});
		const parentLogs = activity.filter((entry) => entry.field === "parent");
		expect(parentLogs.map((entry) => entry.newValue)).toEqual([
			parent.id,
			null,
			parent.id,
		]);
		expect(parentLogs[1]?.oldValue).toBe(parent.id);

		await member.client.issue.delete({ id: parent.id });
		const detached = await member.client.issue.find({ issueId: child.id });
		expect(detached.parentId).toBeNull();
	});
});

describe("sub-item hardening", () => {
	test("an empty parentId or assignee is rejected, not stored", async () => {
		const a = await member.client.issue.create(newIssue("Empty A"));
		await expectCode(
			member.client.issue.update({ id: a.id, parentId: "" }),
			"BAD_REQUEST",
		);
		await expectCode(
			member.client.issue.update({ id: a.id, assignee: "" }),
			"BAD_REQUEST",
		);
		// On create an empty value still means "none".
		const created = await member.client.issue.create(newIssue("Empty C", ""));
		expect(created.parentId).toBeNull();
		const after = await member.client.issue.find({ issueId: a.id });
		expect(after.parentId).toBeNull();
		expect(after.assignee).toBeNull();
	});

	test("refuses a loop through a deep chain", async () => {
		const chain = [await member.client.issue.create(newIssue("Deep 0"))];
		for (let i = 1; i < 5; i++) {
			chain.push(
				await member.client.issue.create(
					newIssue(`Deep ${i}`, first(chain.slice(-1)).id),
				),
			);
		}
		const root = first(chain);
		const leaf = first(chain.slice(-1));
		await expectCode(
			member.client.issue.update({ id: root.id, parentId: leaf.id }),
			"BAD_REQUEST",
		);
		// Moving a middle item under the leaf is a loop too.
		const middle = first(chain.slice(2, 3));
		await expectCode(
			member.client.issue.update({ id: middle.id, parentId: leaf.id }),
			"BAD_REQUEST",
		);
	});

	test("two opposite moves at once can't make a loop", async () => {
		const a = await member.client.issue.create(newIssue("Race A"));
		const b = await member.client.issue.create(newIssue("Race B"));
		await Promise.allSettled([
			member.client.issue.update({ id: a.id, parentId: b.id }),
			member.client.issue.update({ id: b.id, parentId: a.id }),
		]);
		const [ia, ib] = await Promise.all([
			member.client.issue.find({ issueId: a.id }),
			member.client.issue.find({ issueId: b.id }),
		]);
		expect(ia.parentId === b.id && ib.parentId === a.id).toBe(false);
	});

	test("creating under a parent logs the parent", async () => {
		const parent = await member.client.issue.create(newIssue("Create parent"));
		const child = await member.client.issue.create(
			newIssue("Create child", parent.id),
		);
		await Bun.sleep(30);
		const activity = await member.client.activity.findForIssue({
			issueId: child.id,
		});
		const logged = activity.find((entry) => entry.field === "parent");
		expect(logged).toMatchObject({ oldValue: null, newValue: parent.id });
	});

	test("the workspace feed shows a parent change", async () => {
		const parent = await member.client.issue.create(newIssue("Feed parent"));
		const child = await member.client.issue.create(newIssue("Feed child"));
		await member.client.issue.update({ id: child.id, parentId: parent.id });
		await Bun.sleep(30);

		const { events } = await member.client.activity.findWorkspace({
			workspaceId: WORKSPACE,
		});
		const event = events.find(
			(e) =>
				e.type === "issue.updated" &&
				e.issue?.id === child.id &&
				e.details.field === "parent",
		);
		expect(event?.details.to).toBe(parent.id);
	});

	test("deleting a parent detaches and logs its children", async () => {
		const parent = await member.client.issue.create(newIssue("Del parent"));
		const child = await member.client.issue.create(
			newIssue("Del child", parent.id),
		);
		await Bun.sleep(5);
		await member.client.issue.delete({ id: parent.id });
		await Bun.sleep(30);

		const detached = await member.client.issue.find({ issueId: child.id });
		expect(detached.parentId).toBeNull();
		expect(detached.updatedBy).toBe(member.id);
		expect(detached.updatedAt).toBeGreaterThan(child.updatedAt);

		const activity = await member.client.activity.findForIssue({
			issueId: child.id,
		});
		const parentLogs = activity.filter((entry) => entry.field === "parent");
		expect(parentLogs.map((entry) => entry.newValue)).toEqual([
			parent.id,
			null,
		]);
	});
});
