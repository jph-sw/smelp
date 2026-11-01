import { beforeAll, describe, expect, test } from "bun:test";
import path from "node:path";
import { createRouterClient } from "@orpc/server";

// Imported dynamically so setup.ts points the database at a temp file first.
await import("./setup");
const { Auth } = await import("@smelp/auth");
const { DB } = await import("@smelp/db");
const { router } = await import("../src/router");

const sql = new DB().sqlite;
const auth = new Auth();

const OLD_PASSWORD = "the-old-password-1";
const NEW_PASSWORD = "the-new-password-2";

let ipCounter = 0;
const nextIp = () => {
	ipCounter += 1;
	return `198.18.0.${ipCounter}`;
};

function clientFor(token?: string, ip = nextIp()) {
	return createRouterClient(router, {
		context: {
			headers: new Headers(
				token ? { cookie: `auth_session=${token}` } : undefined,
			),
			ip,
		},
	});
}

let userCount = 0;
async function createUser(name: string) {
	userCount += 1;
	const email = `pw-${name}-${userCount}@example.test`;
	const { session, user } = await auth.signUp(
		email,
		name,
		`pw-${name}-${userCount}`,
		OLD_PASSWORD,
	);
	return {
		id: user.id,
		email,
		token: session.authSessionToken,
		client: clientFor(session.authSessionToken),
	};
}

const expectCode = (call: Promise<unknown>, code: string) =>
	expect(call).rejects.toMatchObject({ code });

const canSignIn = async (email: string, password: string) => {
	try {
		await clientFor().auth.signIn({ email, password });
		return true;
	} catch {
		return false;
	}
};

let admin: Awaited<ReturnType<typeof createUser>>;

beforeAll(async () => {
	admin = await createUser("admin");
	await sql`UPDATE auth_user SET role = 'admin' WHERE id = ${admin.id}`;
});

describe("admin reset links", () => {
	test("only instance admins can create them", async () => {
		const user = await createUser("plain");
		const other = await createUser("other");
		await expectCode(
			user.client.instance.createPasswordReset({ userId: other.id }),
			"FORBIDDEN",
		);
		await expectCode(
			clientFor().instance.createPasswordReset({ userId: other.id }),
			"UNAUTHORIZED",
		);
	});

	test("an unknown user is rejected", () =>
		expectCode(
			admin.client.instance.createPasswordReset({ userId: "nobody" }),
			"NOT_FOUND",
		));

	test("a link sets a new password and signs the person out", async () => {
		const user = await createUser("reset");
		const { token } = await admin.client.instance.createPasswordReset({
			userId: user.id,
		});

		expect(await clientFor().auth.previewPasswordReset({ token })).toEqual({
			email: user.email,
		});

		await clientFor().auth.resetPassword({ token, newPassword: NEW_PASSWORD });

		expect(await canSignIn(user.email, NEW_PASSWORD)).toBe(true);
		expect(await canSignIn(user.email, OLD_PASSWORD)).toBe(false);
		await expectCode(user.client.auth.me(), "UNAUTHORIZED");
	});

	test("only the token's hash is stored", async () => {
		const user = await createUser("hash");
		const { token } = await admin.client.instance.createPasswordReset({
			userId: user.id,
		});
		const row = (
			await sql`SELECT tokenHash FROM auth_password_reset WHERE userId = ${user.id}`
		)[0] as { tokenHash: string };
		expect(row.tokenHash).not.toContain(token);
		expect(row.tokenHash).toHaveLength(64);
	});

	test("a link works only once", async () => {
		const user = await createUser("once");
		const { token } = await admin.client.instance.createPasswordReset({
			userId: user.id,
		});
		await clientFor().auth.resetPassword({ token, newPassword: NEW_PASSWORD });

		await expectCode(
			clientFor().auth.resetPassword({
				token,
				newPassword: "yet-another-pass",
			}),
			"NOT_FOUND",
		);
		await expectCode(
			clientFor().auth.previewPasswordReset({ token }),
			"NOT_FOUND",
		);
		expect(await canSignIn(user.email, NEW_PASSWORD)).toBe(true);
	});

	test("using a link at the same time only succeeds once", async () => {
		const user = await createUser("race");
		const { token } = await admin.client.instance.createPasswordReset({
			userId: user.id,
		});
		const results = await Promise.allSettled([
			clientFor().auth.resetPassword({
				token,
				newPassword: "first-new-password",
			}),
			clientFor().auth.resetPassword({
				token,
				newPassword: "second-new-password",
			}),
		]);
		expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
	});

	test("a new link replaces the previous one", async () => {
		const user = await createUser("replace");
		const first = await admin.client.instance.createPasswordReset({
			userId: user.id,
		});
		const second = await admin.client.instance.createPasswordReset({
			userId: user.id,
		});

		await expectCode(
			clientFor().auth.resetPassword({
				token: first.token,
				newPassword: NEW_PASSWORD,
			}),
			"NOT_FOUND",
		);
		await clientFor().auth.resetPassword({
			token: second.token,
			newPassword: NEW_PASSWORD,
		});
	});

	test("an expired or made-up link does nothing", async () => {
		const user = await createUser("expired");
		const { token } = await admin.client.instance.createPasswordReset({
			userId: user.id,
		});
		await sql`UPDATE auth_password_reset SET expiresAt = 1 WHERE userId = ${user.id}`;

		await expectCode(
			clientFor().auth.resetPassword({ token, newPassword: NEW_PASSWORD }),
			"NOT_FOUND",
		);
		await expectCode(
			clientFor().auth.resetPassword({
				token: "made-up",
				newPassword: NEW_PASSWORD,
			}),
			"NOT_FOUND",
		);
		expect(await canSignIn(user.email, OLD_PASSWORD)).toBe(true);
	});

	test("rejects a too-short password and leaves the link usable", async () => {
		const user = await createUser("short");
		const { token } = await admin.client.instance.createPasswordReset({
			userId: user.id,
		});
		await expectCode(
			clientFor().auth.resetPassword({ token, newPassword: "short" }),
			"BAD_REQUEST",
		);
		await clientFor().auth.previewPasswordReset({ token });
	});

	test("a reset clears failed sign-ins from that network", async () => {
		const user = await createUser("lockout");
		const ip = nextIp();
		const person = clientFor(undefined, ip);
		for (let i = 0; i < 10; i++) {
			await expectCode(
				person.auth.signIn({ email: user.email, password: "wrong-password" }),
				"UNAUTHORIZED",
			);
		}
		const { token } = await admin.client.instance.createPasswordReset({
			userId: user.id,
		});
		await person.auth.resetPassword({ token, newPassword: NEW_PASSWORD });

		const result = await person.auth.signIn({
			email: user.email,
			password: NEW_PASSWORD,
		});
		expect(result.user.email).toBe(user.email);
	});
});

describe("change password", () => {
	test("needs the current password", async () => {
		const user = await createUser("wrong");
		await expectCode(
			user.client.auth.changePassword({
				currentPassword: "not-my-password",
				newPassword: NEW_PASSWORD,
			}),
			"BAD_REQUEST",
		);
		expect(await canSignIn(user.email, OLD_PASSWORD)).toBe(true);
	});

	test("needs a session", () =>
		expectCode(
			clientFor().auth.changePassword({
				currentPassword: OLD_PASSWORD,
				newPassword: NEW_PASSWORD,
			}),
			"UNAUTHORIZED",
		));

	test("rejects reusing the same password", async () => {
		const user = await createUser("same");
		await expectCode(
			user.client.auth.changePassword({
				currentPassword: OLD_PASSWORD,
				newPassword: OLD_PASSWORD,
			}),
			"BAD_REQUEST",
		);
	});

	test("keeps this device signed in and signs out the others", async () => {
		const user = await createUser("devices");
		const other = await auth.createAuthSession(user.id);
		const otherDevice = clientFor(other.authSessionToken);
		expect((await otherDevice.auth.me()).user.id).toBe(user.id);

		await user.client.auth.changePassword({
			currentPassword: OLD_PASSWORD,
			newPassword: NEW_PASSWORD,
		});

		expect((await user.client.auth.me()).user.id).toBe(user.id);
		await expectCode(otherDevice.auth.me(), "UNAUTHORIZED");
		expect(await canSignIn(user.email, NEW_PASSWORD)).toBe(true);
		expect(await canSignIn(user.email, OLD_PASSWORD)).toBe(false);
	});

	test("cancels outstanding reset links", async () => {
		const user = await createUser("cancel");
		const { token } = await admin.client.instance.createPasswordReset({
			userId: user.id,
		});
		await user.client.auth.changePassword({
			currentPassword: OLD_PASSWORD,
			newPassword: NEW_PASSWORD,
		});
		await expectCode(
			clientFor().auth.previewPasswordReset({ token }),
			"NOT_FOUND",
		);
	});

	test("repeated wrong guesses are blocked", async () => {
		const user = await createUser("guess");
		const attempt = () =>
			user.client.auth.changePassword({
				currentPassword: "guess-number-one",
				newPassword: NEW_PASSWORD,
			});
		for (let i = 0; i < 10; i++) await expectCode(attempt(), "BAD_REQUEST");
		await expectCode(attempt(), "TOO_MANY_REQUESTS");
	});
});

describe("server command", () => {
	const root = path.resolve(import.meta.dir, "../../..");
	const run = async (...args: string[]) => {
		const proc = Bun.spawn(
			["bun", "run", "apps/api/scripts/create-reset-link.ts", ...args],
			{ cwd: root, env: process.env, stdout: "pipe", stderr: "pipe" },
		);
		const [stdout, stderr, code] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);
		return { stdout, stderr, code };
	};

	test("recovers an account with no admin involved", async () => {
		const user = await createUser("locked-out");
		const { stdout, code } = await run(user.email.toUpperCase());
		expect(code).toBe(0);

		const token = stdout.match(/\/reset-password\/([\w-]+)/)?.[1];
		if (!token) throw new Error(`No link in output: ${stdout}`);

		await clientFor().auth.resetPassword({ token, newPassword: NEW_PASSWORD });
		expect(await canSignIn(user.email, NEW_PASSWORD)).toBe(true);
	});

	test("fails clearly for an unknown email or no email", async () => {
		const unknown = await run("nobody@example.test");
		expect(unknown.code).toBe(1);
		expect(unknown.stderr).toContain("No account found");

		const missing = await run();
		expect(missing.code).toBe(1);
		expect(missing.stderr).toContain("usage");
	});
});
