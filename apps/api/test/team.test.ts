import { beforeEach, describe, expect, test } from "bun:test";
import { createRouterClient } from "@orpc/server";

// Imported dynamically so setup.ts points the database at a temp file first.
await import("./setup");
const { Auth } = await import("@smelp/auth");
const { DB } = await import("@smelp/db");
const { router } = await import("../src/router");

const sql = new DB().sqlite;
const auth = new Auth();

const expectCode = (call: Promise<unknown>, code: string) =>
	expect(call).rejects.toMatchObject({ code });

let counter = 0;
async function createUser(name: string) {
	counter += 1;
	const { session, user } = await auth.signUp(
		`team-${name}-${counter}@example.test`,
		name,
		`team-${name}-${counter}`,
		"correct-horse-battery",
	);
	return {
		id: user.id,
		client: createRouterClient(router, {
			context: {
				headers: new Headers({
					cookie: `auth_session=${session.authSessionToken}`,
				}),
				ip: "198.18.1.1",
			},
		}),
	};
}
type User = Awaited<ReturnType<typeof createUser>>;

async function addMember(spaceId: string, userId: string, role: string) {
	const id = crypto.randomUUID();
	const member = { id, spaceId, userId, role, createdAt: Date.now() + counter };
	counter += 1;
	await sql`INSERT INTO auth_space_member ${sql(member)}`;
	return id;
}

const memberRow = async (spaceId: string, userId: string) =>
	(
		await sql`SELECT * FROM auth_space_member WHERE spaceId = ${spaceId} AND userId = ${userId}`
	)[0] as { id: string; role: string } | undefined;

let owner: User;
let admin2: User;
let member: User;
let guest: User;
let outsider: User;
let workspaceId: string;
let projectId: string;

// A fresh workspace per test, since these tests change who belongs to it.
beforeEach(async () => {
	owner = await createUser("owner");
	admin2 = await createUser("admin2");
	member = await createUser("member");
	guest = await createUser("guest");
	outsider = await createUser("outsider");

	counter += 1;
	const workspace = await owner.client.workspace.create({
		name: `Team ${counter}`,
	});
	workspaceId = workspace.id;
	await addMember(workspaceId, admin2.id, "admin");
	await addMember(workspaceId, member.id, "member");
	await addMember(workspaceId, guest.id, "guest");

	counter += 1;
	projectId = `T${counter % 9999}`;
	await owner.client.project.create({
		id: projectId,
		name: `Project ${projectId}`,
		description: "",
		access: "private",
		icon: "AppWindowIcon",
		workspaceId,
	});
});

const idOf = async (userId: string) => {
	const row = await memberRow(workspaceId, userId);
	if (!row) throw new Error("Expected a membership");
	return row.id;
};

describe("removing a workspace member", () => {
	test("only workspace admins can do it", async () => {
		const memberId = await idOf(guest.id);
		for (const user of [member, guest, outsider]) {
			await expectCode(
				user.client.workspaceMembers.remove({ workspaceId, memberId }),
				"FORBIDDEN",
			);
		}
	});

	test("removes project access too, not just the workspace", async () => {
		await addMember(projectId, member.id, "member");
		expect(
			(await member.client.issues.find({ projectId })).length,
		).toBeGreaterThanOrEqual(0);

		await owner.client.workspaceMembers.remove({
			workspaceId,
			memberId: await idOf(member.id),
		});

		await expectCode(member.client.issues.find({ projectId }), "FORBIDDEN");
		await expectCode(member.client.projects.find({ workspaceId }), "FORBIDDEN");
		expect(await memberRow(projectId, member.id)).toBeUndefined();
		expect(await member.client.workspaces.find()).toEqual([]);
	});

	test("unassigns their work items and keeps the items", async () => {
		await addMember(projectId, member.id, "member");
		const states = await owner.client.states.find({ projectId });
		const state = states[0]?.id ?? "";
		const issue = await owner.client.issue.create({
			title: "Theirs",
			description: "",
			state,
			type: "task",
			assignee: member.id,
			workspaceId,
			projectId,
		});

		await owner.client.workspaceMembers.remove({
			workspaceId,
			memberId: await idOf(member.id),
		});

		const after = await owner.client.issue.find({ issueId: issue.id });
		expect(after.assignee).toBeNull();
		expect(after.title).toBe("Theirs");
	});

	test("cancels invite links they created", async () => {
		const { token } = await admin2.client.workspaceInvites.create({
			workspaceId,
			role: "admin",
		});

		await owner.client.workspaceMembers.remove({
			workspaceId,
			memberId: await idOf(admin2.id),
		});

		await expectCode(
			owner.client.workspaceInvites.preview({ token }),
			"NOT_FOUND",
		);
	});

	test("hands over a project that would have no admin", async () => {
		// The project's only admin is removed, while the remover isn't in the project.
		await sql`DELETE FROM auth_space_member WHERE spaceId = ${projectId}`;
		await addMember(projectId, admin2.id, "admin");

		await owner.client.workspaceMembers.remove({
			workspaceId,
			memberId: await idOf(admin2.id),
		});

		expect((await memberRow(projectId, owner.id))?.role).toBe("admin");
		await owner.client.project.update({ projectId, name: "Still managed" });
	});

	test("promotes an existing project member rather than duplicating them", async () => {
		await sql`DELETE FROM auth_space_member WHERE spaceId = ${projectId}`;
		await addMember(projectId, admin2.id, "admin");
		await addMember(projectId, owner.id, "guest");

		await owner.client.workspaceMembers.remove({
			workspaceId,
			memberId: await idOf(admin2.id),
		});

		const rows = await sql`
			SELECT role FROM auth_space_member WHERE spaceId = ${projectId} AND userId = ${owner.id}
		`;
		expect(rows.length).toBe(1);
		expect((rows[0] as { role: string }).role).toBe("admin");
	});

	test("can't remove the last admin", async () => {
		await owner.client.workspaceMembers.remove({
			workspaceId,
			memberId: await idOf(admin2.id),
		});
		await expectCode(
			owner.client.workspaceMembers.remove({
				workspaceId,
				memberId: await idOf(owner.id),
			}),
			"BAD_REQUEST",
		);
		expect((await memberRow(workspaceId, owner.id))?.role).toBe("admin");
	});

	test("two admins removing each other can't leave none", async () => {
		const [ownerId, admin2Id] = [await idOf(owner.id), await idOf(admin2.id)];
		await Promise.allSettled([
			owner.client.workspaceMembers.remove({ workspaceId, memberId: admin2Id }),
			admin2.client.workspaceMembers.remove({ workspaceId, memberId: ownerId }),
		]);
		const admins = await sql`
			SELECT id FROM auth_space_member WHERE spaceId = ${workspaceId} AND role = 'admin'
		`;
		expect(admins.length).toBeGreaterThanOrEqual(1);
	});

	test("a member id from another workspace is rejected", async () => {
		const other = await createUser("other");
		const theirs = await other.client.workspace.create({
			name: `Elsewhere ${counter}`,
		});
		const row = await memberRow(theirs.id, other.id);
		await expectCode(
			owner.client.workspaceMembers.remove({
				workspaceId,
				memberId: row?.id ?? "",
			}),
			"NOT_FOUND",
		);
		expect(await memberRow(theirs.id, other.id)).toBeDefined();
	});
});

describe("changing a role", () => {
	test("only workspace admins can do it", async () => {
		const memberId = await idOf(member.id);
		for (const user of [member, guest, outsider]) {
			await expectCode(
				user.client.workspaceMembers.updateRole({
					workspaceId,
					memberId,
					role: "admin",
				}),
				"FORBIDDEN",
			);
		}
	});

	test("the new role takes effect straight away", async () => {
		await expectCode(
			member.client.workspaceInvites.find({ workspaceId }),
			"FORBIDDEN",
		);
		await owner.client.workspaceMembers.updateRole({
			workspaceId,
			memberId: await idOf(member.id),
			role: "admin",
		});
		await member.client.workspaceInvites.find({ workspaceId });

		await owner.client.workspaceMembers.updateRole({
			workspaceId,
			memberId: await idOf(member.id),
			role: "guest",
		});
		await expectCode(
			member.client.project.create({
				id: "NOPE",
				name: "Not allowed",
				description: "",
				access: "public",
				icon: "AppWindowIcon",
				workspaceId,
			}),
			"FORBIDDEN",
		);
	});

	test("can't demote the last admin, including yourself", async () => {
		await owner.client.workspaceMembers.remove({
			workspaceId,
			memberId: await idOf(admin2.id),
		});
		await expectCode(
			owner.client.workspaceMembers.updateRole({
				workspaceId,
				memberId: await idOf(owner.id),
				role: "member",
			}),
			"BAD_REQUEST",
		);
	});

	test("an admin can step down when another admin remains", async () => {
		await owner.client.workspaceMembers.updateRole({
			workspaceId,
			memberId: await idOf(owner.id),
			role: "member",
		});
		expect((await memberRow(workspaceId, owner.id))?.role).toBe("member");
	});
});

describe("leaving a workspace", () => {
	test("anyone can leave, and it removes their access", async () => {
		await addMember(projectId, guest.id, "guest");
		await guest.client.workspaceMembers.leave({ workspaceId });

		expect(await memberRow(workspaceId, guest.id)).toBeUndefined();
		expect(await memberRow(projectId, guest.id)).toBeUndefined();
		await expectCode(guest.client.issues.find({ projectId }), "FORBIDDEN");
	});

	test("the last admin can't leave", async () => {
		await owner.client.workspaceMembers.remove({
			workspaceId,
			memberId: await idOf(admin2.id),
		});
		await expectCode(
			owner.client.workspaceMembers.leave({ workspaceId }),
			"BAD_REQUEST",
		);
	});

	test("ownership passes to a remaining admin", async () => {
		await owner.client.workspaceMembers.leave({ workspaceId });

		const workspace = (
			await sql`SELECT ownerId FROM workspace WHERE id = ${workspaceId}`
		)[0] as { ownerId: string };
		const space = (
			await sql`SELECT ownerId FROM auth_space WHERE id = ${projectId}`
		)[0] as { ownerId: string };
		expect(workspace.ownerId).toBe(admin2.id);
		expect(space.ownerId).toBe(admin2.id);
		await admin2.client.project.update({ projectId, name: "Handed over" });
	});

	test("someone who isn't a member can't leave", () =>
		expectCode(
			outsider.client.workspaceMembers.leave({ workspaceId }),
			"FORBIDDEN",
		));
});

describe("project members", () => {
	test("the last project admin can't be removed", async () => {
		const row = await memberRow(projectId, owner.id);
		await expectCode(
			owner.client.projectMembers.remove({
				projectId,
				memberId: row?.id ?? "",
			}),
			"BAD_REQUEST",
		);

		await addMember(projectId, admin2.id, "admin");
		await owner.client.projectMembers.remove({
			projectId,
			memberId: row?.id ?? "",
		});
		expect(await memberRow(projectId, owner.id)).toBeUndefined();
	});
});
