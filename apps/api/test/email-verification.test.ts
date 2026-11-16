import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import { createRouterClient } from "@orpc/server";

// Imported dynamically so setup.ts points the database at a temp file first.
await import("./setup");
const { Auth } = await import("@smelp/auth");
const { DB } = await import("@smelp/db");
const { router } = await import("../src/router");
const { hashSecretToken } = await import("../src/lib/tokens");

const sql = new DB().sqlite;
const auth = new Auth();

// A small real SMTP server, so these tests cover what actually goes over the wire.
type Message = { to: string[]; raw: string; text: string };
const received: Message[] = [];

const decode = (raw: string) =>
	raw
		.replace(/=\r?\n/g, "")
		.replace(/=([0-9A-F]{2})/g, (_, hex) =>
			String.fromCharCode(Number.parseInt(hex, 16)),
		);

type State = { buffer: string; inData: boolean; to: string[] };
const smtp = Bun.listen<State>({
	hostname: "127.0.0.1",
	port: 0,
	socket: {
		open(socket) {
			socket.data = { buffer: "", inData: false, to: [] };
			socket.write("220 test ESMTP\r\n");
		},
		data(socket, chunk) {
			const state = socket.data;
			state.buffer += chunk.toString();
			while (true) {
				if (state.inData) {
					const end = state.buffer.indexOf("\r\n.\r\n");
					if (end === -1) return;
					const raw = state.buffer.slice(0, end);
					state.buffer = state.buffer.slice(end + 5);
					state.inData = false;
					received.push({ to: state.to, raw, text: decode(raw) });
					state.to = [];
					socket.write("250 ok\r\n");
					continue;
				}
				const lineEnd = state.buffer.indexOf("\r\n");
				if (lineEnd === -1) return;
				const line = state.buffer.slice(0, lineEnd);
				state.buffer = state.buffer.slice(lineEnd + 2);
				const verb = line.slice(0, 4).toUpperCase();
				if (verb === "EHLO" || verb === "HELO") socket.write("250 test\r\n");
				else if (verb === "RCPT") {
					state.to.push(line);
					socket.write("250 ok\r\n");
				} else if (verb === "DATA") {
					state.inData = true;
					socket.write("354 go\r\n");
				} else if (verb === "STAR") socket.write("502 not supported\r\n");
				else if (verb === "QUIT") {
					socket.write("221 bye\r\n");
					socket.end();
				} else socket.write("250 ok\r\n");
			}
		},
	},
});

const MAIL_ENV = [
	"SMTP_HOST",
	"SMTP_PORT",
	"SMTP_FROM",
	"SMTP_REQUIRE_TLS",
	"APP_URL",
] as const;
const clearMailEnv = () => {
	for (const name of MAIL_ENV) delete process.env[name];
};
const turnMailOn = () => {
	process.env.SMTP_HOST = "127.0.0.1";
	process.env.SMTP_PORT = String(smtp.port);
	process.env.SMTP_FROM = "smelp <smelp@example.test>";
	process.env.SMTP_REQUIRE_TLS = "false";
	process.env.APP_URL = "https://smelp.example.test/";
};

let counter = 0;
const nextIp = () => {
	counter += 1;
	return `198.19.7.${counter % 250}`;
};
const clientFor = (token?: string) =>
	createRouterClient(router, {
		context: {
			headers: new Headers(
				token ? { cookie: `auth_session=${token}` } : undefined,
			),
			ip: nextIp(),
		},
	});

const PASSWORD = "correct-horse-battery";
const expectCode = (call: Promise<unknown>, code: string) =>
	expect(call).rejects.toMatchObject({ code });

// Signs up through the public route, the way the web app does, and returns a
// client that is signed in as the new account.
async function publicSignUp(options: { inviteToken?: string } = {}) {
	counter += 1;
	const email = `ev-${counter}@example.test`;
	const { user } = await clientFor().auth.signUp({
		email,
		fullName: `Verify ${counter}`,
		displayName: `ev-${counter}`,
		password: PASSWORD,
		inviteToken: options.inviteToken,
	});
	const session = await auth.createAuthSession(user.id);
	return {
		id: user.id,
		email,
		client: clientFor(session.authSessionToken),
	};
}

const rowOf = async (userId: string) =>
	(await sql`SELECT emailVerified FROM auth_user WHERE id = ${userId}`)[0] as {
		emailVerified: number;
	};

const waitForMailTo = async (email: string) => {
	for (let i = 0; i < 150; i += 1) {
		const found = received.find((m) => m.to.some((t) => t.includes(email)));
		if (found) return found;
		await Bun.sleep(20);
	}
	throw new Error(`No email to ${email}`);
};
const tokenIn = (message: Message) => {
	const match = message.text.match(
		/https:\/\/smelp\.example\.test\/verify-email\/([A-Za-z0-9_-]+)/,
	);
	if (!match?.[1]) throw new Error("No verification link in email");
	return match[1];
};

// Mail is sent after the response, so "nothing was sent" can only be told once
// everything before it has gone out: a sentinel sign-up's email goes last.
async function settle() {
	const sentinel = await publicSignUp();
	await waitForMailTo(sentinel.email);
}

let admin: { client: ReturnType<typeof clientFor>; id: string };
let previousMode = "false";
let workspaceCount = 0;

beforeAll(async () => {
	// Not the first account, so sign-ups below aren't treated as first run.
	counter += 1;
	const { session, user } = await auth.signUp(
		`ev-admin-${counter}@example.test`,
		"Verify Admin",
		`ev-admin-${counter}`,
		PASSWORD,
	);
	await sql`UPDATE auth_user SET role = 'admin' WHERE id = ${user.id}`;
	admin = { id: user.id, client: clientFor(session.authSessionToken) };

	const setting = (
		await sql`SELECT value FROM instance_setting WHERE key = 'signup'`
	)[0] as { value: string };
	previousMode = setting.value;
});
beforeEach(async () => {
	received.length = 0;
	await sql`UPDATE instance_setting SET value = 'open' WHERE key = 'signup'`;
	turnMailOn();
});
afterEach(clearMailEnv);
afterAll(async () => {
	await sql`UPDATE instance_setting SET value = ${previousMode} WHERE key = 'signup'`;
	smtp.stop(true);
});

const createWorkspace = (client: ReturnType<typeof clientFor>) => {
	workspaceCount += 1;
	return client.workspace.create({ name: `evw-${workspaceCount}-crew` });
};

describe("public sign-up with email on", () => {
	test("starts unverified, emails a link, and can't create workspaces", async () => {
		const user = await publicSignUp();
		expect(await rowOf(user.id)).toEqual({ emailVerified: 0 });

		const message = await waitForMailTo(user.email);
		expect(message.text).toContain("expires in 24 hours");

		const { user: me } = await user.client.auth.me();
		expect(me.emailVerificationPending).toBe(true);
		await expectCode(createWorkspace(user.client), "FORBIDDEN");
	});

	test("the link verifies the account once, then they can create workspaces", async () => {
		const user = await publicSignUp();
		const token = tokenIn(await waitForMailTo(user.email));

		// Only a hash is stored.
		const stored =
			await sql`SELECT tokenHash FROM auth_email_verification WHERE userId = ${user.id}`;
		expect(stored.length).toBe(1);
		expect(stored[0].tokenHash).toBe(hashSecretToken(token));
		expect(stored[0].tokenHash).not.toBe(token);

		await clientFor().auth.verifyEmail({ token });
		expect(await rowOf(user.id)).toEqual({ emailVerified: 1 });
		const { user: me } = await user.client.auth.me();
		expect(me.emailVerificationPending).toBe(false);
		expect((await createWorkspace(user.client)).id).toBeTruthy();

		await expectCode(clientFor().auth.verifyEmail({ token }), "NOT_FOUND");
	});

	test("a link used twice at the same moment works exactly once", async () => {
		const user = await publicSignUp();
		const token = tokenIn(await waitForMailTo(user.email));

		const results = await Promise.allSettled(
			Array.from({ length: 6 }, () => clientFor().auth.verifyEmail({ token })),
		);
		expect(results.filter((r) => r.status === "fulfilled").length).toBe(1);
		expect(await rowOf(user.id)).toEqual({ emailVerified: 1 });
	});

	test("an expired or made-up link doesn't work", async () => {
		const user = await publicSignUp();
		const token = tokenIn(await waitForMailTo(user.email));
		await sql`UPDATE auth_email_verification SET expiresAt = ${Date.now() - 1000} WHERE userId = ${user.id}`;

		await expectCode(clientFor().auth.verifyEmail({ token }), "NOT_FOUND");
		await expectCode(
			clientFor().auth.verifyEmail({ token: "nope" }),
			"NOT_FOUND",
		);
		expect(await rowOf(user.id)).toEqual({ emailVerified: 0 });
	});

	test("a link for an address that has since changed does nothing", async () => {
		const user = await publicSignUp();
		const token = tokenIn(await waitForMailTo(user.email));
		await sql`UPDATE auth_user SET email = ${`ev-moved-${counter}@example.test`} WHERE id = ${user.id}`;

		await expectCode(clientFor().auth.verifyEmail({ token }), "NOT_FOUND");
		expect(await rowOf(user.id)).toEqual({ emailVerified: 0 });
	});

	test("send again replaces the earlier link", async () => {
		const user = await publicSignUp();
		const first = tokenIn(await waitForMailTo(user.email));

		expect(await user.client.auth.resendEmailVerification()).toEqual({
			success: true,
			sent: true,
		});
		for (let i = 0; i < 150 && received.length < 2; i += 1) await Bun.sleep(20);
		const second = tokenIn(received[1] as Message);
		expect(second).not.toBe(first);

		await expectCode(
			clientFor().auth.verifyEmail({ token: first }),
			"NOT_FOUND",
		);
		await clientFor().auth.verifyEmail({ token: second });
		expect(await rowOf(user.id)).toEqual({ emailVerified: 1 });
	});

	test("send again is limited per account and per address", async () => {
		const user = await publicSignUp();
		await waitForMailTo(user.email);

		for (let i = 0; i < 3; i += 1) {
			await user.client.auth.resendEmailVerification();
		}
		await expectCode(
			user.client.auth.resendEmailVerification(),
			"TOO_MANY_REQUESTS",
		);
		await expectCode(
			clientFor().auth.resendEmailVerification(),
			"UNAUTHORIZED",
		);
	});

	test("send again does nothing for a verified account", async () => {
		const user = await publicSignUp();
		await waitForMailTo(user.email);
		await markVerified(user.id);
		received.length = 0;

		expect(await user.client.auth.resendEmailVerification()).toEqual({
			success: true,
			sent: false,
		});
		await settle();
		expect(received.some((m) => m.to.some((t) => t.includes(user.email)))).toBe(
			false,
		);
	});

	test("an unverified account can still accept an invite", async () => {
		const user = await publicSignUp();
		const workspace = await createWorkspace(admin.client);
		const invite = await admin.client.workspaceInvites.create({
			workspaceId: workspace.id,
			role: "member",
		});
		const joined = await user.client.workspaceInvites.accept({
			token: invite.token,
		});
		expect(joined.workspaceId).toBe(workspace.id);
	});
});

const markVerified = (userId: string) =>
	admin.client.instance.markEmailVerified({ userId });

describe("accounts that count as verified", () => {
	test("signing up with an invite link", async () => {
		const workspace = await createWorkspace(admin.client);
		const invite = await admin.client.workspaceInvites.create({
			workspaceId: workspace.id,
			role: "member",
		});
		const user = await publicSignUp({ inviteToken: invite.token });
		expect(await rowOf(user.id)).toEqual({ emailVerified: 1 });
		expect((await user.client.auth.me()).user.emailVerificationPending).toBe(
			false,
		);
		expect((await createWorkspace(user.client)).id).toBeTruthy();

		await settle();
		expect(received.some((m) => m.to.some((t) => t.includes(user.email)))).toBe(
			false,
		);
	});

	test("with sign-up closed, an invite still gets in, verified", async () => {
		const workspace = await createWorkspace(admin.client);
		const invite = await admin.client.workspaceInvites.create({
			workspaceId: workspace.id,
			role: "member",
		});
		await sql`UPDATE instance_setting SET value = 'closed' WHERE key = 'signup'`;

		await expectCode(
			clientFor().auth.signUp({
				email: `ev-closed-${counter}@example.test`,
				fullName: "Closed",
				displayName: `ev-closed-${counter}`,
				password: PASSWORD,
			}),
			"FORBIDDEN",
		);
		const user = await publicSignUp({ inviteToken: invite.token });
		expect(await rowOf(user.id)).toEqual({ emailVerified: 1 });
	});

	test("public sign-up with email off", async () => {
		clearMailEnv();
		const user = await publicSignUp();
		expect(await rowOf(user.id)).toEqual({ emailVerified: 1 });
		expect((await user.client.auth.me()).user.emailVerificationPending).toBe(
			false,
		);
		expect((await createWorkspace(user.client)).id).toBeTruthy();
		expect(
			(
				await sql`SELECT COUNT(*) AS n FROM auth_email_verification WHERE userId = ${user.id}`
			)[0].n,
		).toBe(0);
		expect(await user.client.auth.resendEmailVerification()).toEqual({
			success: true,
			sent: false,
		});
	});

	test("accounts made without the sign-up route", async () => {
		const { user } = await auth.signUp(
			`ev-direct-${counter}@example.test`,
			"Direct",
			`ev-direct-${counter}`,
			PASSWORD,
		);
		expect(await rowOf(user.id)).toEqual({ emailVerified: 1 });
	});
});

describe("turning email off later", () => {
	test("doesn't leave unverified accounts stuck", async () => {
		const user = await publicSignUp();
		await waitForMailTo(user.email);
		clearMailEnv();

		expect((await user.client.auth.me()).user.emailVerificationPending).toBe(
			false,
		);
		expect((await createWorkspace(user.client)).id).toBeTruthy();
	});
});

describe("instance admins", () => {
	test("see who is verified and can mark an account verified", async () => {
		const user = await publicSignUp();
		await waitForMailTo(user.email);

		const find = async () =>
			(await admin.client.instance.users()).find((u) => u.id === user.id);
		expect((await find())?.emailVerified).toBe(0);
		expect((await admin.client.instance.users())[0]?.emailVerified).toBe(1);

		await markVerified(user.id);
		expect((await find())?.emailVerified).toBe(1);
		expect((await createWorkspace(user.client)).id).toBeTruthy();

		// Its link is gone with it.
		expect(
			(
				await sql`SELECT COUNT(*) AS n FROM auth_email_verification WHERE userId = ${user.id} AND usedAt IS NULL`
			)[0].n,
		).toBe(0);
	});

	test("only instance admins can", async () => {
		const user = await publicSignUp();
		await expectCode(
			user.client.instance.markEmailVerified({ userId: user.id }),
			"FORBIDDEN",
		);
		await expectCode(
			clientFor().instance.markEmailVerified({ userId: user.id }),
			"UNAUTHORIZED",
		);
		await expectCode(markVerified("no-such-user"), "NOT_FOUND");
		expect(await rowOf(user.id)).toEqual({ emailVerified: 0 });
	});
});
