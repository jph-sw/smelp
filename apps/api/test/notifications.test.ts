import { beforeAll, describe, expect, test } from "bun:test";
import { createRouterClient } from "@orpc/server";

// Imported dynamically so setup.ts points the database at a temp file first.
await import("./setup");
const { Auth } = await import("@smelp/auth");
const { DB } = await import("@smelp/db");
const { router } = await import("../src/router");
const { mentionedUserIds, plainMentions } = await import("../src/lib/mentions");
const { notificationsIdle } = await import("../src/lib/notifications");

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

// Notifications are made after the request that caused them has returned, so this
// waits until all of that work (including any email) is done.
const settle = notificationsIdle;

const inbox = async (user: User) =>
	(await user.client.notifications.find({ workspaceId: WORKSPACE }))
		.notifications;
const forIssue = async (user: User, issueId: string) =>
	(await inbox(user)).filter((n) => n.issueId === issueId);
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

	test("reads as the real name of the member, never the typed one", () => {
		const names = new Map([["abc12345", "Bob"]]);
		expect(
			plainMentions("@[Admin](user:abc12345) and @[Eve](user:zzz99999)", names),
		).toBe("@Bob and @Eve");
	});
});

describe("assignment", () => {
	test("notifies the new assignee", async () => {
		const issue = await owner.client.issue.create(
			newIssue("Assign on create", PROJECT, alice.id),
		);
		await settle();

		const [note] = await forIssue(alice, issue.id);
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
		expect(await forIssue(owner, issue.id)).toEqual([]);

		await owner.client.issue.update({ id: issue.id, assignee: bob.id });
		await settle();
		expect(await forIssue(bob, issue.id)).toHaveLength(1);

		// Unassigning tells nobody and leaves what was there alone.
		await owner.client.issue.update({ id: issue.id, assignee: null });
		await settle();
		expect(await forIssue(bob, issue.id)).toHaveLength(1);
	});

	test("a guest in the project is a recipient too", async () => {
		const guest = await createUser("guest");
		await addMember(WORKSPACE, guest.id, "guest");
		await addMember(PROJECT, guest.id, "guest");
		const issue = await owner.client.issue.create(
			newIssue("For a guest", PROJECT, guest.id),
		);
		await settle();
		expect(await forIssue(guest, issue.id)).toHaveLength(1);

		// Guests can comment, so they hear about the replies as well.
		await guest.client.comments.create({ issueId: issue.id, body: "thanks" });
		await owner.client.comments.create({ issueId: issue.id, body: "welcome" });
		await settle();
		const [note] = await forIssue(guest, issue.id);
		expect(note?.actorId).toBe(owner.id);
		expect(await forIssue(owner, issue.id)).toHaveLength(1);
	});
});

describe("one notification per person per item", () => {
	test("comments tell the creator, the assignee and earlier commenters once each", async () => {
		const issue = await alice.client.issue.create(
			newIssue("Discuss", PROJECT, bob.id),
		);
		await carol.client.comments.create({ issueId: issue.id, body: "first" });
		await owner.client.comments.create({ issueId: issue.id, body: "second" });
		await settle();

		// alice created it, so she hears about both comments in one row.
		const [fromAlice] = await forIssue(alice, issue.id);
		expect(await forIssue(alice, issue.id)).toHaveLength(1);
		expect(fromAlice).toMatchObject({ type: "comment", actorId: owner.id });
		// bob's assignment is stronger than a comment, so it stays.
		const bobs = await forIssue(bob, issue.id);
		expect(bobs).toHaveLength(1);
		expect(bobs[0]).toMatchObject({ type: "assigned", actorId: owner.id });
		// carol commented first, so only the second comment reaches her.
		const carols = await forIssue(carol, issue.id);
		expect(carols).toHaveLength(1);
		expect(carols[0]?.type).toBe("comment");
		// owner wrote the second comment and had not commented before.
		expect(await forIssue(owner, issue.id)).toHaveLength(0);
	});

	test("a person who isn't involved isn't told", async () => {
		const issue = await alice.client.issue.create(newIssue("Not involved"));
		await bob.client.comments.create({ issueId: issue.id, body: "hello" });
		await settle();
		expect(await forIssue(carol, issue.id)).toHaveLength(0);
	});

	test("a newer event refreshes the row and makes it unread again", async () => {
		const issue = await alice.client.issue.create(newIssue("Refresh"));
		await bob.client.comments.create({ issueId: issue.id, body: "one" });
		await settle();
		const [before] = await forIssue(alice, issue.id);
		await alice.client.notifications.markRead({ id: before?.id ?? "" });
		expect((await forIssue(alice, issue.id))[0]?.readAt).not.toBeNull();

		await Bun.sleep(5);
		await carol.client.comments.create({ issueId: issue.id, body: "two" });
		await settle();
		const after = await forIssue(alice, issue.id);
		expect(after).toHaveLength(1);
		expect(after[0]).toMatchObject({
			id: before?.id,
			actorId: carol.id,
			readAt: null,
		});
		expect(after[0]?.createdAt).toBeGreaterThan(before?.createdAt ?? 0);
		expect(after[0]?.commentId).not.toBe(before?.commentId);
	});

	test("an unread row keeps its strongest reason, a read one takes the new one", async () => {
		const issue = await owner.client.issue.create(newIssue("Reasons"));
		// bob starts with a plain comment...
		await bob.client.comments.create({ issueId: issue.id, body: "mine" });
		await carol.client.comments.create({ issueId: issue.id, body: "reply" });
		await settle();
		expect((await forIssue(bob, issue.id))[0]?.type).toBe("comment");

		// ...a mention beats it...
		await carol.client.comments.create({
			issueId: issue.id,
			body: mention(bob),
		});
		await settle();
		expect((await forIssue(bob, issue.id))[0]?.type).toBe("mention");

		// ...and a later comment doesn't weaken it while it is unread.
		await carol.client.comments.create({ issueId: issue.id, body: "again" });
		await settle();
		const [note] = await forIssue(bob, issue.id);
		expect(note?.type).toBe("mention");

		// Once read, the next event decides.
		await bob.client.notifications.markRead({ id: note?.id ?? "" });
		await carol.client.comments.create({ issueId: issue.id, body: "later" });
		await settle();
		expect(await forIssue(bob, issue.id)).toHaveLength(1);
		expect((await forIssue(bob, issue.id))[0]).toMatchObject({
			type: "comment",
			readAt: null,
		});
	});

	test("mentioning and assigning the same person gives one mention", async () => {
		const issue = await owner.client.issue.create(newIssue("Both"));
		await owner.client.issue.update({ id: issue.id, assignee: bob.id });
		await owner.client.comments.create({
			issueId: issue.id,
			body: mention(bob),
		});
		await settle();
		let rows = await forIssue(bob, issue.id);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.type).toBe("mention");

		const other = await owner.client.issue.create(newIssue("Both reversed"));
		await owner.client.comments.create({
			issueId: other.id,
			body: mention(carol),
		});
		await owner.client.issue.update({ id: other.id, assignee: carol.id });
		await settle();
		rows = await forIssue(carol, other.id);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.type).toBe("mention");
	});

	test("opening the item reads its notification, and the count is in items", async () => {
		const reader = await createUser("opener");
		await addMember(WORKSPACE, reader.id, "member");
		await addMember(PROJECT, reader.id, "member");
		const one = await owner.client.issue.create(
			newIssue("Open one", PROJECT, reader.id),
		);
		const two = await owner.client.issue.create(
			newIssue("Open two", PROJECT, reader.id),
		);
		await owner.client.comments.create({ issueId: one.id, body: "a" });
		await owner.client.comments.create({ issueId: one.id, body: "b" });
		await settle();
		// Three events on two items.
		expect(await unread(reader)).toBe(2);

		await reader.client.notifications.markReadForIssue({ issueId: one.id });
		expect(await unread(reader)).toBe(1);
		expect((await forIssue(reader, two.id))[0]?.readAt).toBeNull();
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

		expect((await forIssue(bob, issue.id)).map((n) => n.type)).toEqual([
			"mention",
		]);
		expect((await forIssue(carol, issue.id)).map((n) => n.type)).toEqual([
			"mention",
		]);
		// alice created it and isn't mentioned, so it's a plain comment.
		expect((await forIssue(alice, issue.id)).map((n) => n.type)).toEqual([
			"comment",
		]);
	});

	test("mentioning yourself does nothing", async () => {
		const issue = await alice.client.issue.create(newIssue("Self mention"));
		await alice.client.comments.create({
			issueId: issue.id,
			body: mention(alice),
		});
		await settle();
		expect(await forIssue(alice, issue.id)).toHaveLength(0);
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

	test("editing a comment doesn't notify anyone", async () => {
		const issue = await alice.client.issue.create(newIssue("Edited"));
		const comment = await alice.client.comments.create({
			issueId: issue.id,
			body: "plain",
		});
		await settle();
		await alice.client.comments.update({
			commentId: comment.id,
			body: `now with ${mention(bob)}`,
		});
		await settle();
		const rows =
			await sql`SELECT id FROM notification WHERE issueId = ${issue.id}`;
		expect(rows).toHaveLength(0);
	});

	test("deleting the comment keeps the notification, without the link", async () => {
		const issue = await alice.client.issue.create(newIssue("Retracted"));
		const comment = await carol.client.comments.create({
			issueId: issue.id,
			body: mention(bob),
		});
		await settle();
		expect((await forIssue(bob, issue.id))[0]?.commentId).toBe(comment.id);

		await carol.client.comments.delete({ id: comment.id });
		const [note] = await forIssue(bob, issue.id);
		expect(note).toMatchObject({ type: "mention", commentId: null });
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
			expect(await forIssue(user, issue.id)).toHaveLength(0);
		}
		// The one member who can read it is told as the creator.
		expect(await forIssue(alice, issue.id)).toHaveLength(1);
	});

	test("an instance admin outside the workspace isn't notified", async () => {
		const admin = await createUser("instance-admin");
		await sql`UPDATE auth_user SET role = 'admin' WHERE id = ${admin.id}`;
		const issue = await owner.client.issue.create(
			newIssue("Not for admins", PROJECT, alice.id),
		);
		await owner.client.comments.create({
			issueId: issue.id,
			body: mention(admin),
		});
		await settle();
		const rows =
			await sql`SELECT id FROM notification WHERE issueId = ${issue.id} AND userId = ${admin.id}`;
		expect(rows).toHaveLength(0);
	});

	test("a removed member stops seeing what they were told", async () => {
		const removed = await createUser("removed");
		await addMember(WORKSPACE, removed.id, "member");
		await addMember(PRIVATE, removed.id, "member");
		const issue = await owner.client.issue.create(
			newIssue("Then removed", PRIVATE, removed.id),
		);
		await settle();
		const countBefore = await unread(removed);
		expect(await forIssue(removed, issue.id)).toHaveLength(1);

		await sql`DELETE FROM auth_space_member WHERE spaceId = ${PRIVATE} AND userId = ${removed.id}`;
		expect(await forIssue(removed, issue.id)).toHaveLength(0);
		expect(await unread(removed)).toBe(countBefore - 1);

		// Nothing new arrives for them either.
		await owner.client.comments.create({ issueId: issue.id, body: "again" });
		await settle();
		const rows = await sql`
			SELECT id FROM notification WHERE issueId = ${issue.id} AND userId = ${removed.id}
		`;
		expect(rows).toHaveLength(1);
	});

	test("deleting the work item removes its notifications", async () => {
		const issue = await owner.client.issue.create(
			newIssue("Gone", PROJECT, bob.id),
		);
		await settle();
		await owner.client.issue.delete({ id: issue.id });
		expect(await forIssue(bob, issue.id)).toHaveLength(0);
	});
});

describe("watching", () => {
	const otherState = async () => {
		const states = await owner.client.states.find({ projectId: PROJECT });
		return states[states.length - 1]?.id ?? "";
	};
	const watchers = (user: User, issueId: string) =>
		user.client.issue.watchers({ issueId });

	test("a member who watches an item they never touched hears about it until they unwatch", async () => {
		const watcher = await createUser("watcher");
		await addMember(WORKSPACE, watcher.id, "member");
		await addMember(PROJECT, watcher.id, "member");
		const issue = await alice.client.issue.create(newIssue("Watch me"));

		await watcher.client.issue.setWatching({
			issueId: issue.id,
			watching: true,
		});
		await bob.client.comments.create({ issueId: issue.id, body: "news" });
		await settle();
		const [onComment] = await forIssue(watcher, issue.id);
		expect(onComment).toMatchObject({ type: "comment", actorId: bob.id });

		await watcher.client.notifications.markRead({ id: onComment?.id ?? "" });
		await bob.client.issue.update({ id: issue.id, state: await otherState() });
		await settle();
		const afterMove = await forIssue(watcher, issue.id);
		expect(afterMove).toHaveLength(1);
		expect(afterMove[0]).toMatchObject({
			type: "status_changed",
			actorId: bob.id,
			readAt: null,
		});

		await watcher.client.notifications.markRead({ id: afterMove[0]?.id ?? "" });
		await watcher.client.issue.setWatching({
			issueId: issue.id,
			watching: false,
		});
		await bob.client.comments.create({ issueId: issue.id, body: "more" });
		await bob.client.issue.update({ id: issue.id, state: stateIds[PROJECT] });
		await settle();
		const afterUnwatch = await forIssue(watcher, issue.id);
		expect(afterUnwatch).toHaveLength(1);
		expect(afterUnwatch[0]?.readAt).not.toBeNull();
		expect(afterUnwatch[0]?.type).toBe("status_changed");
	});

	test("a state change tells the creator, the assignee and commenters, never the mover", async () => {
		const issue = await alice.client.issue.create(
			newIssue("Moved", PROJECT, bob.id),
		);
		await carol.client.comments.create({ issueId: issue.id, body: "hi" });
		await settle();
		for (const user of [alice, bob]) {
			const [note] = await forIssue(user, issue.id);
			if (note) await user.client.notifications.markRead({ id: note.id });
		}

		await owner.client.issue.update({
			id: issue.id,
			state: await otherState(),
		});
		await settle();
		for (const user of [alice, bob, carol]) {
			const [note] = await forIssue(user, issue.id);
			expect(note).toMatchObject({
				type: "status_changed",
				actorId: owner.id,
				readAt: null,
			});
		}
		expect(await forIssue(owner, issue.id)).toHaveLength(0);
	});

	test("an unread assignment outranks a later state change", async () => {
		const issue = await owner.client.issue.create(
			newIssue("Assigned then moved", PROJECT, carol.id),
		);
		await alice.client.issue.update({
			id: issue.id,
			state: await otherState(),
		});
		await settle();
		const notes = await forIssue(carol, issue.id);
		expect(notes).toHaveLength(1);
		expect(notes[0]).toMatchObject({ type: "assigned", actorId: alice.id });
	});

	test("lists who watches, and setting the same state twice changes nothing", async () => {
		const issue = await alice.client.issue.create(
			newIssue("Watched by", PROJECT, bob.id),
		);
		expect(await watchers(carol, issue.id)).toMatchObject({
			watching: false,
			canWatch: true,
			count: 2,
		});

		for (let i = 0; i < 2; i++) {
			const result = await carol.client.issue.setWatching({
				issueId: issue.id,
				watching: true,
			});
			expect(result).toMatchObject({ watching: true, count: 3 });
		}
		const { watchers: list } = await watchers(alice, issue.id);
		expect(list.map((watcher) => watcher.id).sort()).toEqual(
			[alice.id, bob.id, carol.id].sort(),
		);
		expect(list.find((watcher) => watcher.id === carol.id)?.name).toBe(
			carol.displayName,
		);

		for (let i = 0; i < 2; i++) {
			await carol.client.issue.setWatching({
				issueId: issue.id,
				watching: false,
			});
		}
		expect(await watchers(carol, issue.id)).toMatchObject({
			watching: false,
			count: 2,
		});
	});

	test("commenting or being assigned again starts watching again", async () => {
		const issue = await alice.client.issue.create(newIssue("Back again"));
		await alice.client.issue.setWatching({
			issueId: issue.id,
			watching: false,
		});
		await alice.client.comments.create({ issueId: issue.id, body: "me" });
		expect((await watchers(alice, issue.id)).watching).toBe(true);

		await bob.client.issue.setWatching({ issueId: issue.id, watching: false });
		await alice.client.issue.update({ id: issue.id, assignee: bob.id });
		expect((await watchers(bob, issue.id)).watching).toBe(true);
	});

	test("only people in the workspace can watch", async () => {
		const issue = await alice.client.issue.create(newIssue("Members only"));
		const admin = await createUser("watching-admin");
		await sql`UPDATE auth_user SET role = 'admin' WHERE id = ${admin.id}`;

		expect((await watchers(admin, issue.id)).canWatch).toBe(false);
		expect(
			admin.client.issue.setWatching({ issueId: issue.id, watching: true }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });

		const anonymous = createRouterClient(router, {
			context: { headers: new Headers(), ip: "198.51.100.22" },
		});
		expect(
			anonymous.issue.setWatching({ issueId: issue.id, watching: true }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect((await watchers(alice, issue.id)).count).toBe(1);
	});

	test("leaving the workspace stops watching its items", async () => {
		const leaver = await createUser("leaver");
		await addMember(WORKSPACE, leaver.id, "member");
		await addMember(PROJECT, leaver.id, "member");
		const issue = await alice.client.issue.create(newIssue("Left behind"));
		await leaver.client.issue.setWatching({
			issueId: issue.id,
			watching: true,
		});
		expect((await watchers(alice, issue.id)).count).toBe(2);

		const [membership] = (await sql`
			SELECT id FROM auth_space_member WHERE spaceId = ${WORKSPACE} AND userId = ${leaver.id}
		`) as { id: string }[];
		await owner.client.workspaceMembers.remove({
			workspaceId: WORKSPACE,
			memberId: membership?.id ?? "",
		});
		expect((await watchers(alice, issue.id)).count).toBe(1);
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
		const issue = await owner.client.issue.create(
			newIssue("Private note", PROJECT, bob.id),
		);
		await settle();
		const note = first(await forIssue(bob, issue.id));

		expect(
			carol.client.notifications.markRead({ id: note.id }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect((await inbox(carol)).map((n) => n.id)).not.toContain(note.id);

		const unreadBefore = await unread(bob);
		await carol.client.notifications.markAllRead({ workspaceId: WORKSPACE });
		await carol.client.notifications.markReadForIssue({ issueId: issue.id });
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
