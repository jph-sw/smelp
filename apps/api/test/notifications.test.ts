import { beforeAll, describe, expect, test } from "bun:test";
import { createRouterClient } from "@orpc/server";

// Imported dynamically so setup.ts points the database at a temp file first.
await import("./setup");
const { Auth } = await import("@smelp/auth");
const { DB } = await import("@smelp/db");
const { router } = await import("../src/router");
const { mentionedUserIds } = await import("../src/lib/mentions");

const sql = new DB().sqlite;
const auth = new Auth();

const WORKSPACE = "notification_tests";
const PROJECT = "NTF";
const PRIVATE = "NTP";

function first<T>(items: T[]): T {
	const [item] = items;
	if (item === undefined) throw new Error("Expected at least one item");
	return item;
}

let userCount = 0;
async function createUser(name: string) {
	userCount += 1;
	const { session, user } = await auth.signUp(
		`ntf-${name}-${userCount}@example.test`,
		name,
		`ntf-${name}-${userCount}`,
		"correct-horse-battery",
	);
	return {
		id: user.id,
		displayName: user.displayName,
		client: createRouterClient(router, {
			context: {
				headers: new Headers({
					cookie: `auth_session=${session.authSessionToken}`,
				}),
				ip: "198.51.100.20",
			},
		}),
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

// Notifications are made after the request that caused them has returned.
const settle = () => Bun.sleep(150);

const inbox = async (user: User) =>
	(await user.client.notifications.find({ workspaceId: WORKSPACE }))
		.notifications;
const unread = async (user: User) =>
	(await user.client.notifications.countUnread({ workspaceId: WORKSPACE }))
		.count;

const mention = (user: User) => `@[${user.displayName}](user:${user.id})`;

let owner: User;
let alice: User;
let bob: User;
let carol: User;
let outsider: User;
const stateIds: Record<string, string> = {};

const newIssue = (title: string, projectId = PROJECT, assignee?: string) => ({
	title,
	description: "",
	state: stateIds[projectId] ?? "",
	type: "task",
	workspaceId: WORKSPACE,
	projectId,
	assignee,
});

beforeAll(async () => {
	owner = await createUser("owner");
	alice = await createUser("alice");
	bob = await createUser("bob");
	carol = await createUser("carol");
	outsider = await createUser("outsider");

	await owner.client.workspace.create({ name: "Notification tests" });
	for (const [id, access] of [
		[PROJECT, "public"],
		[PRIVATE, "private"],
	] as const) {
		await owner.client.project.create({
			id,
			name: `Project ${id}`,
			description: "",
			access,
			icon: "AppWindowIcon",
			workspaceId: WORKSPACE,
		});
	}
	for (const user of [alice, bob, carol]) {
		await addMember(WORKSPACE, user.id, "member");
		await addMember(PROJECT, user.id, "member");
	}
	await addMember(PRIVATE, alice.id, "member");
	for (const id of [PROJECT, PRIVATE]) {
		stateIds[id] = first(await owner.client.states.find({ projectId: id })).id;
	}
});

describe("mention syntax", () => {
	test("finds each mentioned id once", () => {
		expect(
			mentionedUserIds(
				"hi @[Ada](user:abc12345) and @[Ada L](user:abc12345), @[Bo](user:xyz98765)",
			),
		).toEqual(["abc12345", "xyz98765"]);
		expect(mentionedUserIds("@Ada and @[x](user:no)")).toEqual([]);
	});
});

describe("assignment", () => {
	test("notifies the new assignee", async () => {
		const issue = await owner.client.issue.create(
			newIssue("Assign on create", PROJECT, alice.id),
		);
		await settle();

		const [note] = await inbox(alice);
		expect(note).toMatchObject({
			type: "assigned",
			issueId: issue.id,
			title: "Assign on create",
			actorId: owner.id,
			readAt: null,
		});
	});

	test("notifies on reassignment, but never about your own action", async () => {
		const issue = await owner.client.issue.create(newIssue("Reassign"));
		await owner.client.issue.update({ id: issue.id, assignee: owner.id });
		await settle();
		expect((await inbox(owner)).filter((n) => n.issueId === issue.id)).toEqual(
			[],
		);

		await owner.client.issue.update({ id: issue.id, assignee: bob.id });
		await settle();
		expect((await inbox(bob)).map((n) => n.issueId)).toContain(issue.id);

		// Unassigning tells nobody.
		const before = (await inbox(bob)).length;
		await owner.client.issue.update({ id: issue.id, assignee: null });
		await settle();
		expect((await inbox(bob)).length).toBe(before);
	});
});

describe("comments", () => {
	test("tell the creator, the assignee and earlier commenters, but not the author", async () => {
		const issue = await alice.client.issue.create(
			newIssue("Discuss", PROJECT, bob.id),
		);
		// carol joins the discussion, so she's a commenter from here on.
		await carol.client.comments.create({ issueId: issue.id, body: "first" });
		await settle();

		await owner.client.comments.create({ issueId: issue.id, body: "second" });
		await settle();

		const forIssue = async (user: User) =>
			(await inbox(user)).filter(
				(n) => n.issueId === issue.id && n.type === "comment",
			);
		// alice created it and bob is assigned: both told about carol, then owner.
		expect(await forIssue(alice)).toHaveLength(2);
		expect(await forIssue(bob)).toHaveLength(2);
		// carol commented first, so only owner's comment reaches her.
		expect(await forIssue(carol)).toHaveLength(1);
		// owner wrote the second comment and had not commented before.
		expect(await forIssue(owner)).toHaveLength(0);
	});

	test("a person who only watches from outside the discussion isn't told", async () => {
		const issue = await alice.client.issue.create(newIssue("Not involved"));
		await bob.client.comments.create({ issueId: issue.id, body: "hello" });
		await settle();
		expect(
			(await inbox(carol)).filter((n) => n.issueId === issue.id),
		).toHaveLength(0);
	});
});

describe("mentions", () => {
	test("notify the mentioned person once, as a mention", async () => {
		const issue = await alice.client.issue.create(
			newIssue("Mention", PROJECT, bob.id),
		);
		await owner.client.comments.create({
			issueId: issue.id,
			body: `${mention(bob)} please look, ${mention(bob)} and ${mention(carol)}`,
		});
		await settle();

		const bobs = (await inbox(bob)).filter(
			(n) => n.issueId === issue.id && n.type !== "assigned",
		);
		expect(bobs.map((n) => n.type)).toEqual(["mention"]);
		const carols = (await inbox(carol)).filter((n) => n.issueId === issue.id);
		expect(carols.map((n) => n.type)).toEqual(["mention"]);
		// alice created it and isn't mentioned, so it's a plain comment.
		const alices = (await inbox(alice)).filter((n) => n.issueId === issue.id);
		expect(alices.map((n) => n.type)).toEqual(["comment"]);
	});

	test("mentioning yourself does nothing", async () => {
		const issue = await alice.client.issue.create(newIssue("Self mention"));
		await alice.client.comments.create({
			issueId: issue.id,
			body: mention(alice),
		});
		await settle();
		expect(
			(await inbox(alice)).filter((n) => n.issueId === issue.id),
		).toHaveLength(0);
	});

	test("ignores ids that aren't people", async () => {
		const issue = await alice.client.issue.create(newIssue("Ghost mention"));
		await alice.client.comments.create({
			issueId: issue.id,
			body: "@[Nobody](user:doesnotexist1)",
		});
		await settle();
		const rows =
			await sql`SELECT id FROM notification WHERE issueId = ${issue.id}`;
		expect(rows).toHaveLength(0);
	});
});

describe("who can read the item", () => {
	test("people outside a private project aren't notified", async () => {
		const issue = await alice.client.issue.create(newIssue("Secret", PRIVATE));
		await owner.client.comments.create({
			issueId: issue.id,
			body: `${mention(bob)} ${mention(outsider)}`,
		});
		await settle();

		for (const user of [bob, outsider]) {
			expect(
				(await inbox(user)).filter((n) => n.issueId === issue.id),
			).toHaveLength(0);
		}
		// The one member who can read it is told as the creator.
		expect(
			(await inbox(alice)).filter((n) => n.issueId === issue.id),
		).toHaveLength(1);
	});

	test("a removed member stops seeing what they were told", async () => {
		const alice = await createUser("removed");
		await addMember(WORKSPACE, alice.id, "member");
		await addMember(PRIVATE, alice.id, "member");
		const issue = await owner.client.issue.create(
			newIssue("Then removed", PRIVATE, alice.id),
		);
		await settle();
		const countBefore = await unread(alice);
		expect(
			(await inbox(alice)).filter((n) => n.issueId === issue.id),
		).toHaveLength(1);

		await sql`DELETE FROM auth_space_member WHERE spaceId = ${PRIVATE} AND userId = ${alice.id}`;
		expect(
			(await inbox(alice)).filter((n) => n.issueId === issue.id),
		).toHaveLength(0);
		expect(await unread(alice)).toBe(countBefore - 1);

		// Nothing new arrives for them either.
		await owner.client.comments.create({ issueId: issue.id, body: "again" });
		await settle();
		const rows = await sql`
			SELECT id FROM notification WHERE issueId = ${issue.id} AND userId = ${alice.id}
		`;
		expect(rows).toHaveLength(1);
	});

	test("deleting the work item removes its notifications", async () => {
		const issue = await owner.client.issue.create(
			newIssue("Gone", PROJECT, bob.id),
		);
		await settle();
		await owner.client.issue.delete({ id: issue.id });
		expect(
			(await inbox(bob)).filter((n) => n.issueId === issue.id),
		).toHaveLength(0);
	});
});

describe("read and unread", () => {
	test("newest first, with a count that follows reading", async () => {
		const reader = await createUser("reader");
		await addMember(WORKSPACE, reader.id, "member");
		await addMember(PROJECT, reader.id, "member");
		for (const title of ["one", "two", "three"]) {
			await owner.client.issue.create(newIssue(title, PROJECT, reader.id));
			await Bun.sleep(5);
		}
		await settle();

		const notes = await inbox(reader);
		expect(notes.map((n) => n.title)).toEqual(["three", "two", "one"]);
		expect(await unread(reader)).toBe(3);

		await reader.client.notifications.markRead({ id: first(notes).id });
		expect(await unread(reader)).toBe(2);
		const [newest] = await inbox(reader);
		expect(newest?.readAt).not.toBeNull();

		await reader.client.notifications.markAllRead({ workspaceId: WORKSPACE });
		expect(await unread(reader)).toBe(0);
		expect(await inbox(reader)).toHaveLength(3);
	});

	test("nobody can read or mark another person's notifications", async () => {
		await owner.client.issue.create(newIssue("Private note", PROJECT, bob.id));
		await settle();
		const note = first(await inbox(bob));

		expect(
			carol.client.notifications.markRead({ id: note.id }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect((await inbox(carol)).map((n) => n.id)).not.toContain(note.id);

		const unreadBefore = await unread(bob);
		await carol.client.notifications.markAllRead({ workspaceId: WORKSPACE });
		expect(await unread(bob)).toBe(unreadBefore);
	});

	test("needs a signed-in user", async () => {
		const anonymous = createRouterClient(router, {
			context: { headers: new Headers(), ip: "198.51.100.21" },
		});
		expect(
			anonymous.notifications.find({ workspaceId: WORKSPACE }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});
});

describe("email preference", () => {
	test("is off by default and can be turned on and off", async () => {
		const user = await createUser("prefs");
		expect((await user.client.auth.me()).user.notifyByEmail).toBe(0);

		await user.client.auth.updateNotificationPreferences({
			emailNotifications: true,
		});
		expect((await user.client.auth.me()).user.notifyByEmail).toBe(1);

		await user.client.auth.updateNotificationPreferences({
			emailNotifications: false,
		});
		expect((await user.client.auth.me()).user.notifyByEmail).toBe(0);
	});
});
