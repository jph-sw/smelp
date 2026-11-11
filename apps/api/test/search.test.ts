import { beforeAll, describe, expect, test } from "bun:test";
import { createRouterClient } from "@orpc/server";

// Imported dynamically so setup.ts points the database at a temp file first.
await import("./setup");
const { Auth } = await import("@smelp/auth");
const { DB } = await import("@smelp/db");
const { router } = await import("../src/router");

const sql = new DB().sqlite;
const auth = new Auth();

const WORKSPACE = "search_tests";
const OTHER_WORKSPACE = "search_elsewhere";
const ALPHA = "SRA";
const BETA = "SRB";
const SECRET = "SRP";
const ELSEWHERE = "SRX";

function clientFor(token?: string) {
	const headers = new Headers(
		token ? { cookie: `auth_session=${token}` } : undefined,
	);
	return createRouterClient(router, {
		context: { headers, ip: "198.51.100.20" },
	});
}

let userCount = 0;
async function createUser(name: string) {
	userCount += 1;
	const { session, user } = await auth.signUp(
		`search-${name}-${userCount}@example.test`,
		name,
		`search-${name}-${userCount}`,
		"correct-horse-battery",
	);
	return { id: user.id, client: clientFor(session.authSessionToken) };
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

const expectCode = (call: Promise<unknown>, code: string) =>
	expect(call).rejects.toMatchObject({ code });

let owner: User;
let otherOwner: User;
let alphaMember: User;
let betaGuest: User;
let workspaceGuest: User;
let outsider: User;
let instanceAdmin: User;

const keys: Record<string, string> = {};

async function createProject(
	user: User,
	workspaceId: string,
	id: string,
	access: "public" | "private",
) {
	await user.client.project.create({
		id,
		name: `Project ${id}`,
		description: "",
		access,
		icon: "AppWindowIcon",
		workspaceId,
	});
}

async function createIssue(
	user: User,
	workspaceId: string,
	projectId: string,
	title: string,
) {
	const [state] = await user.client.states.find({ projectId });
	if (!state) throw new Error("Expected a state");
	const issue = await user.client.issue.create({
		title,
		description: "",
		state: state.id,
		type: "task",
		workspaceId,
		projectId,
	});
	keys[title] = issue.id;
	return issue;
}

const search = (user: User, query: string, workspaceId = WORKSPACE) =>
	user.client.issues.search({ workspaceId, query });
const idsOf = (results: { id: string }[]) => results.map((r) => r.id).sort();

beforeAll(async () => {
	owner = await createUser("owner");
	otherOwner = await createUser("other");
	alphaMember = await createUser("alpha");
	betaGuest = await createUser("betaguest");
	workspaceGuest = await createUser("wsguest");
	outsider = await createUser("outsider");
	instanceAdmin = await createUser("admin");
	await sql`UPDATE auth_user SET role = 'admin' WHERE id = ${instanceAdmin.id}`;

	await owner.client.workspace.create({ name: "Search tests" });
	await createProject(owner, WORKSPACE, ALPHA, "public");
	await createProject(owner, WORKSPACE, BETA, "public");
	await createProject(owner, WORKSPACE, SECRET, "private");

	await otherOwner.client.workspace.create({ name: "Search elsewhere" });
	await createProject(otherOwner, OTHER_WORKSPACE, ELSEWHERE, "public");

	await addMember(WORKSPACE, alphaMember.id, "member");
	await addMember(ALPHA, alphaMember.id, "member");
	await addMember(WORKSPACE, betaGuest.id, "guest");
	await addMember(BETA, betaGuest.id, "guest");
	await addMember(WORKSPACE, workspaceGuest.id, "guest");
	// In the other workspace's project, but not in this workspace.
	await addMember(ELSEWHERE, owner.id, "member");

	await createIssue(owner, WORKSPACE, ALPHA, "Fix the login button");
	await createIssue(owner, WORKSPACE, BETA, "Login page copy");
	await createIssue(owner, WORKSPACE, SECRET, "Login secrets rotation");
	await createIssue(otherOwner, OTHER_WORKSPACE, ELSEWHERE, "Login elsewhere");
	await createIssue(owner, WORKSPACE, ALPHA, "Reach 100% coverage");
	await createIssue(owner, WORKSPACE, ALPHA, "Reach 1000 coverage");
	await createIssue(owner, WORKSPACE, ALPHA, "Rename user_id");
	await createIssue(owner, WORKSPACE, ALPHA, "Rename userXid");
	await createIssue(owner, WORKSPACE, ALPHA, "Wow! Great");
	await createIssue(owner, WORKSPACE, ALPHA, "Wow Great");
});

describe("issues.search", () => {
	test("finds by title, case-insensitively, across projects", async () => {
		const results = await search(owner, "LOGIN");
		expect(idsOf(results)).toEqual(
			[
				keys["Fix the login button"],
				keys["Login page copy"],
				keys["Login secrets rotation"],
			].sort() as string[],
		);
		const row = results.find((r) => r.id === keys["Login page copy"]);
		expect(row).toMatchObject({
			title: "Login page copy",
			projectId: BETA,
			projectName: `Project ${BETA}`,
			assignee: null,
			assigneeName: null,
		});
		expect(row?.stateName).toBeString();
	});

	test("finds an exact key, in any case", async () => {
		const key = keys["Login page copy"] as string;
		expect(idsOf(await search(owner, key))).toEqual([key]);
		expect(idsOf(await search(owner, key.toLowerCase()))).toEqual([key]);
		expect(idsOf(await search(owner, `  ${key}  `))).toEqual([key]);
	});

	test("returns the newest-updated first, and at most 50", async () => {
		for (let i = 0; i < 52; i++) {
			await createIssue(owner, WORKSPACE, BETA, `Bulk item ${i}`);
		}
		const older = keys["Bulk item 0"] as string;
		await sql`UPDATE issue SET updatedAt = ${Date.now() + 60_000} WHERE id = ${older}`;

		const results = await search(owner, "bulk item");
		expect(results).toHaveLength(50);
		expect(results[0]?.id).toBe(older);
		const times = results.map((r) => r.updatedAt);
		expect(times).toEqual([...times].sort((a, b) => b - a));
	});

	test("returns nothing for an empty or one-character query", async () => {
		expect(await search(owner, "")).toEqual([]);
		expect(await search(owner, "   ")).toEqual([]);
		expect(await search(owner, "l")).toEqual([]);
		expect(await search(owner, " l ")).toEqual([]);
	});

	test("treats LIKE wildcards and the escape character literally", async () => {
		expect(idsOf(await search(owner, "100%"))).toEqual([
			keys["Reach 100% coverage"] as string,
		]);
		expect(idsOf(await search(owner, "user_id"))).toEqual([
			keys["Rename user_id"] as string,
		]);
		expect(idsOf(await search(owner, "wow!"))).toEqual([
			keys["Wow! Great"] as string,
		]);
		expect(await search(owner, "%%")).toEqual([]);
		expect(await search(owner, "__")).toEqual([]);
	});
});

describe("issues.search access", () => {
	test("never returns items from another workspace", async () => {
		const results = await search(owner, "login");
		expect(idsOf(results)).not.toContain(keys["Login elsewhere"]);
		expect(await search(owner, keys["Login elsewhere"] as string)).toEqual([]);
		// And the other workspace only sees its own.
		expect(idsOf(await search(otherOwner, "login", OTHER_WORKSPACE))).toEqual([
			keys["Login elsewhere"] as string,
		]);
	});

	test("never returns items from a private project the user isn't in", async () => {
		const results = await search(alphaMember, "login");
		expect(idsOf(results)).toEqual([keys["Fix the login button"] as string]);
		expect(
			await search(alphaMember, keys["Login secrets rotation"] as string),
		).toEqual([]);
	});

	test("skips public projects the user hasn't joined", async () => {
		expect(
			await search(alphaMember, keys["Login page copy"] as string),
		).toEqual([]);
	});

	test("guests only see the projects they're a guest of", async () => {
		expect(idsOf(await search(betaGuest, "login"))).toEqual([
			keys["Login page copy"] as string,
		]);
		expect(await search(workspaceGuest, "login")).toEqual([]);
	});

	test("instance admins see public projects, but not private ones they aren't in", async () => {
		expect(idsOf(await search(instanceAdmin, "login"))).toEqual(
			[
				keys["Fix the login button"],
				keys["Login page copy"],
			].sort() as string[],
		);
		expect(
			await search(instanceAdmin, keys["Login secrets rotation"] as string),
		).toEqual([]);

		await addMember(SECRET, instanceAdmin.id, "member");
		expect(idsOf(await search(instanceAdmin, "login"))).toContain(
			keys["Login secrets rotation"] as string,
		);
		await sql`DELETE FROM auth_space_member WHERE spaceId = ${SECRET} AND userId = ${instanceAdmin.id}`;
	});

	test("rejects users from another workspace", async () => {
		await expectCode(search(outsider, "login"), "FORBIDDEN");
		await expectCode(search(otherOwner, "login"), "FORBIDDEN");
	});

	test("rejects signed-out callers", async () => {
		await expectCode(
			clientFor().issues.search({ workspaceId: WORKSPACE, query: "login" }),
			"UNAUTHORIZED",
		);
	});

	test("rejects an unknown workspace", () =>
		expectCode(search(owner, "login", "no_such_workspace"), "NOT_FOUND"));
});
