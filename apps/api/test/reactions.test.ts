import { beforeAll, describe, expect, test } from "bun:test";
import { createRouterClient } from "@orpc/server";

// Imported dynamically so setup.ts points the database at a temp file first.
await import("./setup");
const { Auth } = await import("@smelp/auth");
const { DB } = await import("@smelp/db");
const { router } = await import("../src/router");

const sql = new DB().sqlite;
const auth = new Auth();

const WORKSPACE = "reaction_tests";
const PROJECT = "REA";

function first<T>(items: T[]): T {
	const [item] = items;
	if (item === undefined) throw new Error("Expected at least one item");
	return item;
}

let userCount = 0;
async function createUser(name: string) {
	userCount += 1;
	const { session, user } = await auth.signUp(
		`re-${name}-${userCount}@example.test`,
		name,
		`re-${name}-${userCount}`,
		"correct-horse-battery",
	);
	const headers = new Headers({
		cookie: `auth_session=${session.authSessionToken}`,
	});
	return {
		id: user.id,
		name: `re-${name}-${userCount}`,
		client: createRouterClient(router, {
			context: { headers, ip: "198.51.100.11" },
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

let admin: User;
let member: User;
let other: User;
let guest: User;
let outsider: User;
let issueId: string;
let commentId: string;

async function reactionsOn(id: string, as: User = member) {
	const comments = await as.client.comments.find({ issueId });
	return first(comments.filter((comment) => comment.id === id)).reactions;
}

const set = (
	user: User,
	emoji: string,
	reacted: boolean,
	id: string = commentId,
) =>
	user.client.comments.setReaction({
		commentId: id,
		emoji: emoji as "👍",
		reacted,
	});

beforeAll(async () => {
	admin = await createUser("admin");
	member = await createUser("member");
	other = await createUser("other");
	guest = await createUser("guest");
	outsider = await createUser("outsider");

	await admin.client.workspace.create({ name: "Reaction tests" });
	await admin.client.project.create({
		id: PROJECT,
		name: "Reactions",
		description: "",
		access: "private",
		icon: "AppWindowIcon",
		workspaceId: WORKSPACE,
	});
	for (const user of [member, other, guest]) {
		await addMember(WORKSPACE, user.id, "member");
	}
	await addMember(PROJECT, member.id, "member");
	await addMember(PROJECT, other.id, "member");
	await addMember(PROJECT, guest.id, "guest");

	const states = await admin.client.states.find({ projectId: PROJECT });
	const issue = await member.client.issue.create({
		title: "Discuss",
		description: "",
		state: first(states).id,
		type: "task",
		workspaceId: WORKSPACE,
		projectId: PROJECT,
	});
	issueId = issue.id;
	commentId = (await member.client.comments.create({ issueId, body: "Hi" })).id;
});

describe("reactions", () => {
	test("setting adds then removes a reaction", async () => {
		expect(await set(member, "👍", true)).toEqual({ reacted: true });
		expect(await reactionsOn(commentId)).toEqual([
			{ emoji: "👍", count: 1, reacted: true, users: [member.name] },
		]);

		expect(await set(member, "👍", false)).toEqual({ reacted: false });
		expect(await reactionsOn(commentId)).toEqual([]);
	});

	test("setting the same state twice is a no-op", async () => {
		await set(member, "👍", true);
		await set(member, "👍", true);
		expect(await reactionsOn(commentId)).toEqual([
			{ emoji: "👍", count: 1, reacted: true, users: [member.name] },
		]);
		await set(member, "👍", false);
		await set(member, "👍", false);
		expect(await reactionsOn(commentId)).toEqual([]);
	});

	test("counts per emoji, who reacted, and highlighting is per viewer", async () => {
		await set(member, "🎉", true);
		await set(other, "🎉", true);
		await set(other, "👀", true);

		expect(await reactionsOn(commentId, member)).toEqual([
			{
				emoji: "🎉",
				count: 2,
				reacted: true,
				users: [member.name, other.name],
			},
			{ emoji: "👀", count: 1, reacted: false, users: [other.name] },
		]);
		expect(await reactionsOn(commentId, other)).toMatchObject([
			{ emoji: "🎉", reacted: true },
			{ emoji: "👀", reacted: true },
		]);
	});

	test("the database allows one row per person per emoji", async () => {
		const row = { commentId, userId: member.id, emoji: "🎉", createdAt: 1 };
		await expect(
			(async () => sql`INSERT INTO comment_reaction ${sql(row)}`)(),
		).rejects.toThrow();
	});

	test("only the fixed set of emoji is accepted", async () => {
		for (const emoji of ["🦄", "", "thumbsup", "👍👍", "\u2764"]) {
			await expect(set(member, emoji, true)).rejects.toBeDefined();
		}
	});

	test("guests may react like they may comment; outsiders may not", async () => {
		expect(await set(guest, "😄", true)).toEqual({ reacted: true });
		await expect(set(outsider, "😄", true)).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
	});

	test("unknown comments are not found", async () => {
		await expect(set(member, "👍", true, "nope")).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
	});

	test("reacting leaves no activity-feed entry", async () => {
		const count = async () =>
			first(
				(await sql`SELECT COUNT(*) AS n FROM activity_logs`) as { n: number }[],
			).n;
		const before = await count();
		await set(other, "😕", true);
		await set(other, "😕", false);
		expect(await count()).toBe(before);
	});

	test("archived projects refuse reactions, but still show them", async () => {
		await admin.client.project.archive({ projectId: PROJECT });
		await expect(set(member, "👍", true)).rejects.toMatchObject({
			code: "FORBIDDEN",
			message: "This project is archived",
		});
		expect((await reactionsOn(commentId)).length).toBeGreaterThan(0);
		await admin.client.project.unarchive({ projectId: PROJECT });
	});

	test("deleting a comment removes its reactions", async () => {
		await member.client.comments.delete({ id: commentId });
		const rows = (await sql`
			SELECT COUNT(*) AS n FROM comment_reaction WHERE commentId = ${commentId}
		`) as { n: number }[];
		expect(first(rows).n).toBe(0);
	});
});
