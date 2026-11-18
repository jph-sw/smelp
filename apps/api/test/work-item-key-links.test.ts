import { beforeAll, describe, expect, test } from "bun:test";
import { createRouterClient } from "@orpc/server";

// Imported dynamically so setup.ts points the database at a temp file first.
await import("./setup");
const { Auth } = await import("@smelp/auth");
const { DB } = await import("@smelp/db");
const { router } = await import("../src/router");

const sql = new DB().sqlite;
const auth = new Auth();

const WORKSPACE = "key_link_tests";
const OPEN_PROJECT = "KLO";
const SECRET_PROJECT = "KLS";

function clientFor(token?: string) {
	const headers = new Headers(
		token ? { cookie: `auth_session=${token}` } : undefined,
	);
	return createRouterClient(router, {
		context: { headers, ip: "198.51.100.30" },
	});
}
type Client = ReturnType<typeof clientFor>;

let userCount = 0;
async function createUser(name: string) {
	userCount += 1;
	const { session, user } = await auth.signUp(
		`key-links-${name}-${userCount}@example.test`,
		name,
		`key-links-${name}-${userCount}`,
		"correct-horse-battery",
	);
	return { id: user.id, client: clientFor(session.authSessionToken) };
}
type User = Awaited<ReturnType<typeof createUser>>;

async function createProject(id: string, access: "public" | "private") {
	await owner.client.project.create({
		id,
		name: `Project ${id}`,
		description: "",
		access,
		icon: "AppWindowIcon",
		workspaceId: WORKSPACE,
	});
}

async function createIssue(projectId: string, title: string) {
	const [state] = await owner.client.states.find({ projectId });
	if (!state) throw new Error("Expected a state");
	const issue = await owner.client.issue.create({
		title,
		description: "",
		state: state.id,
		workspaceId: WORKSPACE,
		projectId,
	});
	return { id: issue.id, state };
}

const resolvedIds = async (client: Client, keys: string[]) =>
	(await client.issues.resolveKeys({ keys })).map((link) => link.id).sort();

const visitor = clientFor();
let admin: User;
let owner: User;
let outsider: User;
let openIssue: Awaited<ReturnType<typeof createIssue>>;
let secretIssue: Awaited<ReturnType<typeof createIssue>>;

beforeAll(async () => {
	admin = await createUser("admin");
	await sql`UPDATE auth_user SET role = 'admin' WHERE id = ${admin.id}`;
	owner = await createUser("owner");
	outsider = await createUser("outsider");

	await owner.client.workspace.create({ name: "Key link tests" });
	await createProject(OPEN_PROJECT, "public");
	await createProject(SECRET_PROJECT, "private");
	openIssue = await createIssue(OPEN_PROJECT, "Open item");
	secretIssue = await createIssue(SECRET_PROJECT, "Secret item");

	await admin.client.instance.update({ publicAccess: true });
	await owner.client.workspace.update({
		workspaceId: WORKSPACE,
		public: true,
	});
});

describe("issues.resolveKeys", () => {
	test("gives a member what a link to their item shows", async () => {
		expect(
			await owner.client.issues.resolveKeys({ keys: [secretIssue.id] }),
		).toEqual([
			{
				id: secretIssue.id,
				title: "Secret item",
				workspaceId: WORKSPACE,
				stateName: secretIssue.state.name,
				stateColor: secretIssue.state.color,
			},
		]);
	});

	test("keeps a private project's items from people outside it", async () => {
		expect(await resolvedIds(outsider.client, [secretIssue.id])).toEqual([]);
		expect(await resolvedIds(visitor, [secretIssue.id])).toEqual([]);
	});

	test("answers an unreadable key and an unknown key the same way", async () => {
		const unknown = `${SECRET_PROJECT}-99999`;
		expect(await visitor.issues.resolveKeys({ keys: [unknown] })).toEqual(
			await visitor.issues.resolveKeys({ keys: [secretIssue.id] }),
		);
	});

	test("resolves a public project's item for anyone", async () => {
		expect(await resolvedIds(visitor, [openIssue.id])).toEqual([openIssue.id]);
		expect(await resolvedIds(outsider.client, [openIssue.id])).toEqual([
			openIssue.id,
		]);
	});

	test("stops at the instance's public access switch", async () => {
		await admin.client.instance.update({ publicAccess: false });
		try {
			expect(await resolvedIds(visitor, [openIssue.id])).toEqual([]);
		} finally {
			await admin.client.instance.update({ publicAccess: true });
		}
	});

	test("returns only the readable keys of a mixed list", async () => {
		expect(
			await resolvedIds(visitor, [
				openIssue.id,
				secretIssue.id,
				"KLO-99999",
				"UTF-8",
			]),
		).toEqual([openIssue.id]);
	});

	test("matches a key exactly", async () => {
		expect(
			await resolvedIds(owner.client, [openIssue.id.toLowerCase()]),
		).toEqual([]);
	});

	test("still links to items in an archived project", async () => {
		await sql`UPDATE project SET archivedAt = ${Date.now()} WHERE id = ${OPEN_PROJECT}`;
		try {
			expect(await resolvedIds(owner.client, [openIssue.id])).toEqual([
				openIssue.id,
			]);
		} finally {
			await sql`UPDATE project SET archivedAt = NULL WHERE id = ${OPEN_PROJECT}`;
		}
	});

	test("answers an empty list with nothing", async () => {
		expect(await resolvedIds(owner.client, [])).toEqual([]);
	});

	test("accepts 100 keys and refuses more", async () => {
		const keys = Array.from({ length: 100 }, (_, i) => `KLO-${i + 1000}`);
		expect(await resolvedIds(owner.client, keys)).toEqual([]);
		await expect(
			owner.client.issues.resolveKeys({ keys: [...keys, "KLO-2000"] }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	test("refuses a key that is too long", async () => {
		await expect(
			owner.client.issues.resolveKeys({ keys: ["K".repeat(33)] }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});
});
