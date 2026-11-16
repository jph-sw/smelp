import { beforeAll, describe, expect, test } from "bun:test";
import { createRouterClient } from "@orpc/server";

// Imported dynamically so setup.ts points the database at a temp file first.
await import("./setup");
const { Auth } = await import("@smelp/auth");
const { DB } = await import("@smelp/db");
const { router } = await import("../src/router");
const { attachmentResponse, uploadAttachment } = await import(
	"../src/lib/attachments"
);

const sql = new DB().sqlite;
const auth = new Auth();

const WORKSPACE = "token_tests";
const PROJECT = "TOK";
const OTHER_WORKSPACE = "token_tests_elsewhere";
const OTHER_PROJECT = "ELS";

const expectCode = (call: Promise<unknown>, code: string) =>
	expect(call).rejects.toMatchObject({ code });

const clientWith = (headers: Headers) =>
	createRouterClient(router, { context: { headers, ip: "198.18.4.1" } });

const bearer = (token: string, extra: Record<string, string> = {}) =>
	new Headers({ authorization: `Bearer ${token}`, ...extra });

let counter = 0;
async function createUser() {
	counter += 1;
	const { session, user } = await auth.signUp(
		`token-${counter}@example.test`,
		`Token ${counter}`,
		`token-${counter}`,
		"correct-horse-battery",
	);
	const cookie = `auth_session=${session.authSessionToken}`;
	const headers = new Headers({ cookie });
	return { id: user.id, cookie, headers, client: clientWith(headers) };
}
type User = Awaited<ReturnType<typeof createUser>>;

async function createToken(
	user: User,
	expiresInDays: 30 | 90 | 365 | null = null,
) {
	const created = await user.client.apiTokens.create({
		name: "Agent",
		expiresInDays,
	});
	return { ...created, client: clientWith(bearer(created.token)) };
}

let owner: User;
let member: User;
let stateId: string;

beforeAll(async () => {
	owner = await createUser();
	member = await createUser();

	await owner.client.workspace.create({ name: "Token tests" });
	await owner.client.project.create({
		id: PROJECT,
		name: "Tokens",
		description: "",
		access: "private",
		icon: "AppWindowIcon",
		workspaceId: WORKSPACE,
	});
	for (const spaceId of [WORKSPACE, PROJECT]) {
		await sql`INSERT INTO auth_space_member ${sql({
			id: crypto.randomUUID(),
			spaceId,
			userId: member.id,
			role: "member",
			createdAt: Date.now(),
		})}`;
	}

	await owner.client.workspace.create({ name: "Token tests elsewhere" });
	await owner.client.project.create({
		id: OTHER_PROJECT,
		name: "Elsewhere",
		description: "",
		access: "private",
		icon: "AppWindowIcon",
		workspaceId: OTHER_WORKSPACE,
	});

	const [state] = await owner.client.states.find({ projectId: PROJECT });
	if (!state) throw new Error("Expected the project to have a state");
	stateId = state.id;
});

describe("creating and listing tokens", () => {
	test("the token is returned once and never listed", async () => {
		const user = await createUser();
		const created = await user.client.apiTokens.create({
			name: "  CI bot  ",
			expiresInDays: 30,
		});

		expect(created.token).toMatch(/^smelp_[A-Za-z0-9_-]{43}$/);
		expect(created.name).toBe("CI bot");
		expect(created.lastUsedAt).toBeNull();
		expect(created.expiresAt).toBe(
			created.createdAt + 30 * 24 * 60 * 60 * 1000,
		);

		const listed = await user.client.apiTokens.find();
		expect(listed).toEqual([
			{
				id: created.id,
				name: "CI bot",
				createdAt: created.createdAt,
				lastUsedAt: null,
				expiresAt: created.expiresAt,
			},
		]);
		expect(JSON.stringify(listed)).not.toContain(created.token);
	});

	test("lists only the caller's tokens, newest first", async () => {
		const user = await createUser();
		const other = await createUser();
		const older = await createToken(user);
		await Bun.sleep(2);
		const newer = await createToken(user, 365);
		await createToken(other);

		const ids = (await user.client.apiTokens.find()).map((token) => token.id);
		expect(ids).toEqual([newer.id, older.id]);
	});

	test("rejects blank and over-long names and unknown expiries", async () => {
		for (const input of [
			{ name: "   ", expiresInDays: null },
			{ name: "x".repeat(101), expiresInDays: null },
			{ name: "Fine", expiresInDays: 7 },
		]) {
			await expectCode(
				member.client.apiTokens.create(input as never),
				"BAD_REQUEST",
			);
		}
	});

	test("caps how many tokens one person can have", async () => {
		const user = await createUser();
		for (let i = 0; i < 50; i++) await createToken(user);

		const call = user.client.apiTokens.create({
			name: "One too many",
			expiresInDays: null,
		});
		await expectCode(call, "BAD_REQUEST");
		await expect(call).rejects.toThrow("at most 50");
		expect(await user.client.apiTokens.find()).toHaveLength(50);
	});
});

describe("calling the API with a token", () => {
	test("reads and creates work items as the token's owner", async () => {
		const { client } = await createToken(member);

		const created = await client.issue.create({
			title: "Filed by an agent",
			description: "",
			state: stateId,
			type: "task",
			workspaceId: WORKSPACE,
			projectId: PROJECT,
		});
		const issue = await client.issue.find({ issueId: created.id });
		expect(issue.title).toBe("Filed by an agent");
		expect(issue.createdBy).toBe(member.id);

		const workspaces = await client.workspaces.find();
		expect(workspaces.map((workspace) => workspace.id)).toContain(WORKSPACE);
	});

	test("gets no further than its owner could", async () => {
		const { client } = await createToken(member);
		await expectCode(
			client.issues.find({ projectId: OTHER_PROJECT }),
			"FORBIDDEN",
		);
		await expectCode(
			client.workspace.find({ workspaceId: OTHER_WORKSPACE }),
			"FORBIDDEN",
		);
	});

	test("records when it was last used", async () => {
		const token = await createToken(member);
		await token.client.workspaces.find();

		const listed = (await member.client.apiTokens.find()).find(
			({ id }) => id === token.id,
		);
		expect(listed?.lastUsedAt).toBeGreaterThanOrEqual(token.createdAt);
	});

	test("downloads an attachment", async () => {
		const { token } = await createToken(member);
		const issue = await member.client.issue.create({
			title: "With a file",
			description: "",
			state: stateId,
			type: "task",
			workspaceId: WORKSPACE,
			projectId: PROJECT,
		});
		// Built by hand, like attachments.test.ts, so the request carries its size.
		const boundary = "----smelp-token-boundary";
		const body = await new Blob([
			`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="notes.txt"\r\nContent-Type: text/plain\r\n\r\nagent notes\r\n--${boundary}--\r\n`,
		]).arrayBuffer();
		const uploaded = await uploadAttachment(
			new Request(`http://localhost/api/attachments?issueId=${issue.id}`, {
				method: "POST",
				headers: bearer(token, {
					"x-smelp-upload": "1",
					"content-type": `multipart/form-data; boundary=${boundary}`,
					"content-length": String(body.byteLength),
				}),
				body,
			}),
		);
		expect(uploaded.status).toBe(201);
		const { id, uploaderId } = (await uploaded.json()) as {
			id: string;
			uploaderId: string;
		};
		expect(uploaderId).toBe(member.id);

		const downloaded = await attachmentResponse(bearer(token), id);
		expect(downloaded.status).toBe(200);
		expect(await downloaded.text()).toBe("agent notes");
	});
});

describe("tokens that don't work", () => {
	test("a wrong, revoked or expired token is refused even with a valid cookie", async () => {
		const revoked = await createToken(member);
		await member.client.apiTokens.revoke({ id: revoked.id });
		const expired = await createToken(member, 30);
		await sql`UPDATE api_token SET expiresAt = ${Date.now() - 1} WHERE id = ${expired.id}`;
		const valid = await createToken(member);

		for (const authorization of [
			"Bearer smelp_not-a-real-token",
			`Bearer ${revoked.token}`,
			`Bearer ${expired.token}`,
			valid.token,
			`Basic ${valid.token}`,
			`Bearer ${valid.token.slice("smelp_".length)}`,
		]) {
			const client = clientWith(
				new Headers({ authorization, cookie: member.cookie }),
			);
			await expectCode(client.workspaces.find(), "UNAUTHORIZED");
		}
	});

	test("a signed-out call without a token is refused", async () => {
		await expectCode(
			clientWith(new Headers()).workspaces.find(),
			"UNAUTHORIZED",
		);
	});
});

describe("what a token can't do", () => {
	test("manage tokens, change the password or run the instance", async () => {
		const admin = await createUser();
		await sql`UPDATE auth_user SET role = 'admin' WHERE id = ${admin.id}`;
		const { client } = await createToken(admin);

		await expectCode(client.apiTokens.find(), "UNAUTHORIZED");
		await expectCode(
			client.apiTokens.create({ name: "Another", expiresInDays: null }),
			"UNAUTHORIZED",
		);
		await expectCode(
			client.auth.changePassword({
				currentPassword: "correct-horse-battery",
				newPassword: "a-brand-new-password",
			}),
			"UNAUTHORIZED",
		);
		await expectCode(client.instance.users(), "UNAUTHORIZED");
		await expectCode(
			client.instance.createPasswordReset({ userId: member.id }),
			"UNAUTHORIZED",
		);
		expect(await auth.verifyPassword(admin.id, "correct-horse-battery")).toBe(
			true,
		);
	});
});

describe("revoking", () => {
	test("stops the token from working", async () => {
		const token = await createToken(member);
		await token.client.workspaces.find();

		expect(await member.client.apiTokens.revoke({ id: token.id })).toEqual({
			success: true,
		});
		await expectCode(token.client.workspaces.find(), "UNAUTHORIZED");
		expect(
			(await member.client.apiTokens.find()).map((listed) => listed.id),
		).not.toContain(token.id);
	});

	test("someone else's token is not found and keeps working", async () => {
		const token = await createToken(member);
		await expectCode(
			owner.client.apiTokens.revoke({ id: token.id }),
			"NOT_FOUND",
		);
		await token.client.workspaces.find();
	});

	test("deleting the person removes their tokens", async () => {
		const user = await createUser();
		const token = await createToken(user);
		await sql`DELETE FROM auth_user WHERE id = ${user.id}`;

		expect(
			await sql`SELECT id FROM api_token WHERE id = ${token.id}`,
		).toHaveLength(0);
		await expectCode(token.client.workspaces.find(), "UNAUTHORIZED");
	});
});
