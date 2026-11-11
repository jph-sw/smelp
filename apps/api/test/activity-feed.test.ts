import { beforeAll, describe, expect, test } from "bun:test";
import { createRouterClient } from "@orpc/server";

// Imported dynamically so setup.ts points the database at a temp file first.
await import("./setup");
const { Auth } = await import("@smelp/auth");
const { DB } = await import("@smelp/db");
const { router } = await import("../src/router");

const sql = new DB().sqlite;
const auth = new Auth();
const PASSWORD = "correct-horse-battery";

function clientFor(token?: string) {
	const headers = new Headers(
		token ? { cookie: `auth_session=${token}` } : undefined,
	);
	return createRouterClient(router, {
		context: { headers, ip: "198.51.100.7" },
	});
}

let userCount = 0;
async function createUser(name: string) {
	userCount += 1;
	const { session, user } = await auth.signUp(
		`${name}-${userCount}@feed.test`,
		name,
		`${name}-feed-${userCount}`,
		PASSWORD,
	);
	return {
		id: user.id,
		displayName: user.displayName,
		client: clientFor(session.authSessionToken),
	};
}
type User = Awaited<ReturnType<typeof createUser>>;

async function addMember(spaceId: string, userId: string, role: string) {
	await sql`INSERT INTO auth_space_member ${sql({
		id: crypto.randomUUID(),
		spaceId,
		userId,
		role,
		createdAt: Date.now(),
	})}`;
}

const expectCode = (call: Promise<unknown>, code: string) =>
	expect(call).rejects.toMatchObject({ code });

// Events are written by a subscriber after the call returns.
const settle = () => Bun.sleep(30);

const WORKSPACE = "feed_corp";
const OTHER_WORKSPACE = "other_feed";
const PUBLIC_PROJECT = "FPUB";
const PRIVATE_PROJECT = "FPRIV";

let owner: User;
let member: User;
let guest: User;
let privateMember: User;
let outsider: User;
let instanceAdmin: User;

const newProject = (id: string, access: "public" | "private") => ({
	id,
	name: `Project ${id}`,
	description: "",
	access,
	icon: "AppWindowIcon",
	workspaceId: WORKSPACE,
});

async function feedTypes(user: User, workspaceId = WORKSPACE) {
	const { events } = await user.client.activity.findWorkspace({ workspaceId });
	return events;
}

async function issueIn(projectId: string, title: string) {
	const states = await owner.client.states.find({ projectId });
	const [state] = states;
	if (!state) throw new Error("Expected a state");
	return owner.client.issue.create({
		title,
		description: "",
		state: state.id,
		type: "task",
		workspaceId: WORKSPACE,
		projectId,
	});
}

beforeAll(async () => {
	owner = await createUser("Owner");
	member = await createUser("Member");
	guest = await createUser("Guest");
	privateMember = await createUser("Private");
	outsider = await createUser("Outsider");
	instanceAdmin = await createUser("Admin");
	await sql`UPDATE auth_user SET role = 'admin' WHERE id = ${instanceAdmin.id}`;

	await owner.client.workspace.create({ name: "Feed Corp" });
	await outsider.client.workspace.create({ name: "Other Feed" });
	await addMember(WORKSPACE, member.id, "member");
	await addMember(WORKSPACE, guest.id, "guest");
	await addMember(WORKSPACE, privateMember.id, "member");

	await owner.client.project.create(newProject(PUBLIC_PROJECT, "public"));
	await owner.client.project.create(newProject(PRIVATE_PROJECT, "private"));
	await addMember(PUBLIC_PROJECT, member.id, "member");
	await addMember(PUBLIC_PROJECT, guest.id, "guest");
	await addMember(PRIVATE_PROJECT, privateMember.id, "member");

	await issueIn(PUBLIC_PROJECT, "Public work");
	await issueIn(PRIVATE_PROJECT, "Secret work");
	await settle();
});

describe("state changes", () => {
	test("create log rows with the project and names", async () => {
		const created = await owner.client.state.create({
			projectId: PUBLIC_PROJECT,
			name: "Review",
			color: "#123456",
			group: "started",
		});
		await owner.client.state.update({ id: created.id, name: "In review" });
		const states = await owner.client.states.find({
			projectId: PUBLIC_PROJECT,
		});
		await owner.client.state.reorder({
			projectId: PUBLIC_PROJECT,
			stateIds: states.map((state) => state.id).reverse(),
		});
		const [target] = states.filter((state) => state.id !== created.id);
		if (!target) throw new Error("Expected another state");
		await owner.client.state.delete({
			id: created.id,
			moveToStateId: target.id,
		});
		await settle();

		const rows = (await sql`
			SELECT action, metadata FROM activity_logs
			WHERE entityType = 'state' AND workspaceId = ${WORKSPACE}
			ORDER BY createdAt, rowid
		`) as { action: string; metadata: string }[];
		expect(rows.map((row) => row.action)).toEqual([
			"state.created",
			"state.updated",
			"state.reordered",
			"state.deleted",
		]);
		for (const row of rows) {
			expect(JSON.parse(row.metadata).projectId).toBe(PUBLIC_PROJECT);
		}

		const events = await feedTypes(member);
		const updated = events.find((event) => event.type === "state.updated");
		expect(updated?.details).toMatchObject({
			name: "In review",
			oldName: "Review",
			changes: ["name"],
		});
		expect(updated?.project?.name).toBe(`Project ${PUBLIC_PROJECT}`);
		const deleted = events.find((event) => event.type === "state.deleted");
		expect(deleted?.details).toMatchObject({
			name: "In review",
			movedToName: target.name,
		});
		expect(updated?.actorName).toBe(owner.displayName);
	});

	test("an unchanged order or update logs nothing", async () => {
		const states = await owner.client.states.find({
			projectId: PUBLIC_PROJECT,
		});
		const [state] = states;
		if (!state) throw new Error("Expected a state");
		const before = (await sql`SELECT COUNT(*) AS n FROM activity_logs`)[0];
		await owner.client.state.reorder({
			projectId: PUBLIC_PROJECT,
			stateIds: states.map((s) => s.id),
		});
		await owner.client.state.update({ id: state.id, name: state.name });
		await settle();
		expect((await sql`SELECT COUNT(*) AS n FROM activity_logs`)[0]).toEqual(
			before,
		);
	});

	test("project updates are logged", async () => {
		await owner.client.project.update({
			projectId: PUBLIC_PROJECT,
			description: "Now with a description",
		});
		await settle();
		const [event] = await feedTypes(member);
		expect(event?.type).toBe("project.updated");
		expect(event?.details.changes).toEqual(["description"]);
		expect(JSON.stringify(event)).not.toContain("Now with a description");
	});
});

describe("workspace feed", () => {
	test("is newest first and pages without gaps or repeats", async () => {
		await outsider.client.project.create({
			...newProject("PAGE", "public"),
			workspaceId: OTHER_WORKSPACE,
		});
		// Several events share a time, so the id has to break the tie.
		const base = Date.now() + 60_000;
		const rows = Array.from({ length: 120 }, (_, n) => ({
			id: crypto.randomUUID(),
			workspaceId: OTHER_WORKSPACE,
			entityType: "issue",
			entityId: `PAGE-${n + 1}`,
			action: "created",
			actorId: outsider.id,
			field: null,
			oldValue: null,
			newValue: null,
			metadata: JSON.stringify({ title: `Item ${n}`, projectId: "PAGE" }),
			createdAt: base + Math.floor(n / 4),
		}));
		await sql`INSERT INTO activity_logs ${sql(rows)}`;

		const seen: { id: string; type: string }[] = [];
		let before: { createdAt: number; id: string } | undefined;
		for (let page = 0; page < 10; page++) {
			const result = await outsider.client.activity.findWorkspace({
				workspaceId: OTHER_WORKSPACE,
				before,
			});
			if (page === 0) expect(result.events).toHaveLength(50);
			seen.push(...result.events);
			if (!result.next) break;
			before = result.next;
		}

		const expected = [...rows]
			.sort((a, b) =>
				a.createdAt === b.createdAt
					? b.id.localeCompare(a.id)
					: b.createdAt - a.createdAt,
			)
			.map((row) => row.id);
		expect(seen.map((event) => event.id).slice(0, 120)).toEqual(expected);
		// Then the workspace's and the project's own creation.
		expect(seen.slice(120).map((event) => event.type)).toEqual([
			"project.created",
			"workspace.created",
		]);
	});

	test("refuses signed-out callers", () =>
		expectCode(
			clientFor().activity.findWorkspace({ workspaceId: WORKSPACE }),
			"UNAUTHORIZED",
		));

	test("refuses people from another workspace", () =>
		expectCode(
			outsider.client.activity.findWorkspace({ workspaceId: WORKSPACE }),
			"FORBIDDEN",
		));

	test("never includes another workspace's events", async () => {
		const events = await feedTypes(instanceAdmin);
		expect(events.some((event) => event.project?.id === "PAGE")).toBe(false);
	});
});

describe("private projects", () => {
	const mentionsPrivate = (events: Awaited<ReturnType<typeof feedTypes>>) =>
		JSON.stringify(events).includes(PRIVATE_PROJECT) ||
		JSON.stringify(events).includes("Secret work");

	test("are hidden from workspace members outside them", async () => {
		expect(mentionsPrivate(await feedTypes(member))).toBe(false);
		expect(mentionsPrivate(await feedTypes(guest))).toBe(false);
	});

	test("are shown to their members and instance admins", async () => {
		const events = await feedTypes(privateMember);
		expect(
			events.some(
				(event) =>
					event.type === "issue.created" &&
					event.issue?.title === "Secret work",
			),
		).toBe(true);
		expect(mentionsPrivate(await feedTypes(instanceAdmin))).toBe(true);
	});

	test("older events without a project id are still hidden", async () => {
		const issue = await issueIn(PRIVATE_PROJECT, "Legacy secret");
		await sql`INSERT INTO activity_logs ${sql({
			id: crypto.randomUUID(),
			workspaceId: WORKSPACE,
			entityType: "issue",
			entityId: issue.id,
			action: "status_changed",
			actorId: owner.id,
			field: "status",
			oldValue: "a",
			newValue: "b",
			metadata: JSON.stringify({
				field: "status",
				oldValue: "a",
				newValue: "b",
			}),
			createdAt: Date.now() + 1,
		})}`;
		await sql`INSERT INTO activity_logs ${sql({
			id: crypto.randomUUID(),
			workspaceId: WORKSPACE,
			entityType: "comment",
			entityId: crypto.randomUUID(),
			action: "commented",
			actorId: owner.id,
			field: null,
			oldValue: null,
			newValue: null,
			// The issue is gone, so only its id says where it was.
			metadata: JSON.stringify({ issueId: `${PRIVATE_PROJECT}-999` }),
			createdAt: Date.now() + 2,
		})}`;
		await settle();

		expect(mentionsPrivate(await feedTypes(member))).toBe(false);
		const visible = await feedTypes(privateMember);
		expect(visible.filter((e) => e.issue?.id === issue.id)).toHaveLength(2);
		expect(visible.some((e) => e.issue?.id === `${PRIVATE_PROJECT}-999`)).toBe(
			true,
		);
	});

	test("adding someone to one isn't shown to others", async () => {
		await owner.client.projectMembers.add({
			projectId: PRIVATE_PROJECT,
			userId: member.id,
			role: "member",
		});
		await settle();
		const events = await feedTypes(privateMember);
		expect(events[0]?.type).toBe("project.member_added");
		expect(events[0]?.details.userName).toBe(member.displayName);
		// The member added can now see it, and the guest still can't.
		expect((await feedTypes(guest)).map((e) => e.id)).not.toContain(
			events[0]?.id,
		);
		await sql`DELETE FROM auth_space_member WHERE spaceId = ${PRIVATE_PROJECT} AND userId = ${member.id}`;
	});

	test("deleting one is only shown to its former members", async () => {
		await owner.client.project.create(newProject("GONE", "private"));
		await addMember("GONE", privateMember.id, "member");
		await issueIn("GONE", "Gone work");
		await owner.client.project.delete({ projectId: "GONE" });
		await settle();

		const deleted = (await feedTypes(privateMember)).find(
			(event) => event.type === "project.deleted",
		);
		expect(deleted?.details.name).toBe("Project GONE");
		expect(JSON.stringify(await feedTypes(member))).not.toContain("GONE");

		// A new project with the same id doesn't inherit the old one's events.
		await owner.client.project.create(newProject("GONE", "public"));
		await addMember("GONE", member.id, "member");
		await settle();
		expect(JSON.stringify(await feedTypes(member))).not.toContain("Gone work");
	});
});

describe("assigning while creating", () => {
	test("shows who it was assigned to", async () => {
		const states = await owner.client.states.find({
			projectId: PUBLIC_PROJECT,
		});
		const issue = await owner.client.issue.create({
			title: "Assigned at birth",
			description: "",
			state: states[0]?.id ?? "",
			type: "task",
			workspaceId: WORKSPACE,
			projectId: PUBLIC_PROJECT,
			assignee: member.id,
		});
		await settle();

		const assigned = (await feedTypes(member)).find(
			(event) =>
				event.type === "issue.assigned" && event.issue?.id === issue.id,
		);
		expect(assigned?.details?.to).toBe(member.displayName);
	});
});

describe("archiving", () => {
	test("shows like other project changes, and a private one only to its members", async () => {
		await owner.client.project.archive({ projectId: PUBLIC_PROJECT });
		await owner.client.project.unarchive({ projectId: PUBLIC_PROJECT });
		await owner.client.project.archive({ projectId: PRIVATE_PROJECT });
		await owner.client.project.unarchive({ projectId: PRIVATE_PROJECT });
		await settle();

		const archiving = (events: Awaited<ReturnType<typeof feedTypes>>) =>
			events
				.filter(
					(e) =>
						e.type === "project.archived" || e.type === "project.unarchived",
				)
				.map((e) => `${e.type} ${e.project?.id}`)
				// Both happen within a millisecond, so their order isn't fixed.
				.sort();

		expect(archiving(await feedTypes(member))).toEqual([
			`project.archived ${PUBLIC_PROJECT}`,
			`project.unarchived ${PUBLIC_PROJECT}`,
		]);
		expect(archiving(await feedTypes(privateMember))).toEqual([
			`project.archived ${PRIVATE_PROJECT}`,
			`project.archived ${PUBLIC_PROJECT}`,
			`project.unarchived ${PRIVATE_PROJECT}`,
			`project.unarchived ${PUBLIC_PROJECT}`,
		]);
	});
});

describe("comment edits", () => {
	test("show on the feed, only to people who can see the work item", async () => {
		const issue = await issueIn(PRIVATE_PROJECT, "Edited secret");
		const comment = await owner.client.comments.create({
			issueId: issue.id,
			body: "First",
		});
		await owner.client.comments.update({
			commentId: comment.id,
			body: "Second",
		});
		await settle();

		const edits = (events: Awaited<ReturnType<typeof feedTypes>>) =>
			events.filter((event) => event.type === "comment.updated");
		const seen = edits(await feedTypes(privateMember));
		expect(seen.some((event) => event.issue?.id === issue.id)).toBe(true);
		expect(JSON.stringify(seen)).not.toContain("Second");
		expect(edits(await feedTypes(member))).toEqual([]);
		expect(edits(await feedTypes(guest))).toEqual([]);
	});
});

describe("guests", () => {
	test("see their projects but not member changes", async () => {
		const extra = await createUser("Extra");
		await addMember(WORKSPACE, extra.id, "member");
		const { id: memberId } = (
			await sql`SELECT id FROM auth_space_member WHERE spaceId = ${WORKSPACE} AND userId = ${extra.id}`
		)[0] as { id: string };
		await owner.client.workspaceMembers.updateRole({
			workspaceId: WORKSPACE,
			memberId,
			role: "admin",
		});
		await settle();

		const guestEvents = await feedTypes(guest);
		expect(guestEvents.some((e) => e.type.startsWith("workspace."))).toBe(
			false,
		);
		expect(
			guestEvents.some(
				(e) => e.type === "issue.created" && e.project?.id === PUBLIC_PROJECT,
			),
		).toBe(true);

		const memberEvents = await feedTypes(member);
		expect(memberEvents[0]?.type).toBe("workspace.member_role_changed");
		expect(memberEvents[0]?.details).toMatchObject({
			userName: extra.displayName,
			from: "member",
			to: "admin",
		});
	});

	test("old joins that can't be placed are hidden from everyone but instance admins", async () => {
		const id = crypto.randomUUID();
		await sql`INSERT INTO activity_logs ${sql({
			id,
			workspaceId: WORKSPACE,
			entityType: "workspace",
			entityId: crypto.randomUUID(),
			action: "workspace.member_joined",
			actorId: owner.id,
			field: null,
			oldValue: null,
			newValue: null,
			metadata: JSON.stringify({ userId: member.id, role: "member" }),
			createdAt: Date.now() + 5,
		})}`;
		expect((await feedTypes(owner)).map((e) => e.id)).not.toContain(id);
		expect((await feedTypes(instanceAdmin)).map((e) => e.id)).toContain(id);
	});
});

describe("invites", () => {
	test("show the email to admins only, and never the token", async () => {
		const invite = await owner.client.workspaceInvites.create({
			workspaceId: WORKSPACE,
			email: "newcomer@feed.test",
			role: "member",
		});
		await settle();

		const forAdmin = await feedTypes(owner);
		expect(forAdmin[0]?.type).toBe("workspace.member_invited");
		expect(forAdmin[0]?.details.email).toBe("newcomer@feed.test");

		const forMember = await feedTypes(member);
		expect(forMember[0]?.type).toBe("workspace.member_invited");
		expect(forMember[0]?.details.email).toBeNull();

		expect(JSON.stringify([forAdmin, forMember])).not.toContain(invite.token);
		expect(JSON.stringify(await feedTypes(guest))).not.toContain("newcomer");
	});
});
