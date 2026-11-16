import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createRouterClient } from "@orpc/server";

// Imported dynamically so setup.ts points the database at a temp file first.
await import("./setup");
const { DB } = await import("@smelp/db");
const { router } = await import("../src/router");

const sql = new DB().sqlite;
const PASSWORD = "correct-horse-battery";

let ipCounter = 0;
function clientFor(token?: string) {
	ipCounter += 1;
	return createRouterClient(router, {
		context: {
			headers: new Headers(
				token ? { cookie: `auth_session=${token}` } : undefined,
			),
			ip: `192.0.2.${ipCounter}`,
			resHeaders: new Headers(),
		},
	});
}

// Signs up through the route, and reads the session cookie it sets.
async function signUp(name: string, inviteToken?: string) {
	const resHeaders = new Headers();
	ipCounter += 1;
	const anonymous = createRouterClient(router, {
		context: {
			headers: new Headers(),
			ip: `192.0.2.${ipCounter}`,
			resHeaders,
		},
	});
	const { user } = await anonymous.auth.signUp({
		email: `${name}@example.test`,
		fullName: name,
		displayName: name,
		password: PASSWORD,
		inviteToken,
	});
	const token = resHeaders
		.get("set-cookie")
		?.match(/auth_session=([^;]+)/)?.[1];
	if (!token) throw new Error("Expected a session cookie");
	return { id: user.id, client: clientFor(decodeURIComponent(token)) };
}

const expectCode = (call: Promise<unknown>, code: string) =>
	expect(call).rejects.toMatchObject({ code });

const roleOf = async (id: string) =>
	(
		(await sql`SELECT role FROM auth_user WHERE id = ${id}`)[0] as {
			role: string;
		}
	).role;

const WORKSPACE = "invite_tests";
let admin: Awaited<ReturnType<typeof signUp>>;

const newInvite = (role: "guest" | "member" | "admin" = "member") =>
	admin.client.workspaceInvites.create({ workspaceId: WORKSPACE, role });

beforeAll(async () => {
	// Other test files share this database, and these tests need a fresh install.
	await sql`DELETE FROM auth_space_invite`;
	await sql`DELETE FROM auth_space`;
	await sql`DELETE FROM auth_user`;
	await sql`UPDATE instance_setting SET value = 'closed' WHERE key = 'signup'`;
});

describe("first run", () => {
	test("a fresh install reports that it needs setup", async () => {
		expect(await clientFor().instance.status()).toEqual({
			needsSetup: true,
			signup: "closed",
			emailEnabled: false,
			secureCookies: false,
		});
	});

	test("the first account becomes the instance admin", async () => {
		admin = await signUp("first-admin");
		expect(await roleOf(admin.id)).toBe("admin");
		expect((await clientFor().instance.status()).needsSetup).toBe(false);

		await admin.client.workspace.create({ name: "Invite tests" });
	});

	test("sign-up is then closed", () =>
		expectCode(signUp("too-late"), "FORBIDDEN"));
});

describe("sign-up policy", () => {
	test("only instance admins can change it, list users or see the version", async () => {
		const invite = await newInvite();
		const user = await signUp("regular", invite.token);

		await expectCode(
			user.client.instance.update({ signup: "open" }),
			"FORBIDDEN",
		);
		await expectCode(user.client.instance.users(), "FORBIDDEN");
		await expectCode(
			clientFor().instance.update({ signup: "open" }),
			"UNAUTHORIZED",
		);
		await expectCode(clientFor().instance.users(), "UNAUTHORIZED");
		expect(await roleOf(user.id)).toBe("user");

		await expectCode(user.client.instance.version(), "FORBIDDEN");
		await expectCode(clientFor().instance.version(), "UNAUTHORIZED");
		const { version } = await admin.client.instance.version();
		expect(version).toBe(
			(await Bun.file("package.json").json()).version as string,
		);
		expect(version).toMatch(/^\d+\.\d+\.\d+$/);
	});

	test("an admin can open it, and later accounts aren't admins", async () => {
		await admin.client.instance.update({ signup: "open" });
		const user = await signUp("open-door");
		expect(await roleOf(user.id)).toBe("user");

		await admin.client.instance.update({ signup: "closed" });
		await expectCode(signUp("closed-again"), "FORBIDDEN");
	});

	test("the user list never includes password data", async () => {
		const users = await admin.client.instance.users();
		expect(users.length).toBeGreaterThan(0);
		expect(Object.keys(users[0] ?? {}).sort()).toEqual([
			"createdAt",
			"displayName",
			"email",
			"emailVerified",
			"fullName",
			"id",
			"image",
			"role",
		]);
	});
});

describe("guest sign-up", () => {
	const statusMode = async () => (await clientFor().instance.status()).signup;

	afterAll(() => admin.client.instance.update({ signup: "closed" }));

	test("public sign-up in guest mode makes a guest", async () => {
		await admin.client.instance.update({ signup: "guest" });
		expect(await statusMode()).toBe("guest");

		const guest = await signUp("guest-door");
		expect(await roleOf(guest.id)).toBe("guest");
	});

	test("an invite in guest mode still makes a user", async () => {
		await admin.client.instance.update({ signup: "guest" });
		const invite = await newInvite("guest");
		const user = await signUp("guest-mode-invitee", invite.token);
		expect(await roleOf(user.id)).toBe("user");
	});

	test("open mode makes a user and closed refuses", async () => {
		await admin.client.instance.update({ signup: "open" });
		expect(await roleOf((await signUp("open-again")).id)).toBe("user");

		await admin.client.instance.update({ signup: "closed" });
		await expectCode(signUp("closed-guest"), "FORBIDDEN");
	});

	test("an unknown mode is rejected", () =>
		expectCode(
			admin.client.instance.update({ signup: "everyone" as "open" }),
			"BAD_REQUEST",
		));

	test("a guest can't create a workspace until an admin makes them a user", async () => {
		await admin.client.instance.update({ signup: "guest" });
		const guest = await signUp("guest-promoted");

		await expect(
			guest.client.workspace.create({ name: "Guest space" }),
		).rejects.toMatchObject({
			code: "FORBIDDEN",
			message:
				"Guest accounts can't create workspaces. Ask a workspace admin for an invite link.",
		});

		await admin.client.instance.setUserRole({ userId: guest.id, role: "user" });
		expect(await roleOf(guest.id)).toBe("user");
		await guest.client.workspace.create({ name: "Guest space" });

		await admin.client.instance.setUserRole({
			userId: guest.id,
			role: "guest",
		});
		expect(await roleOf(guest.id)).toBe("guest");
	});

	test("a guest can still accept a workspace invite with its role", async () => {
		await admin.client.instance.update({ signup: "guest" });
		const guest = await signUp("guest-joins");
		const invite = await newInvite("member");

		await guest.client.workspaceInvites.accept({ token: invite.token });
		const members = await admin.client.workspaceMembers.find({
			workspaceId: WORKSPACE,
		});
		expect(members.find((member) => member.userId === guest.id)?.role).toBe(
			"member",
		);
	});

	test("only instance admins can change roles, and never an admin's", async () => {
		await admin.client.instance.update({ signup: "guest" });
		const guest = await signUp("guest-pusher");

		await expectCode(
			guest.client.instance.setUserRole({ userId: guest.id, role: "user" }),
			"FORBIDDEN",
		);
		await expectCode(
			clientFor().instance.setUserRole({ userId: guest.id, role: "user" }),
			"UNAUTHORIZED",
		);
		await expectCode(
			admin.client.instance.setUserRole({ userId: admin.id, role: "guest" }),
			"BAD_REQUEST",
		);
		await expectCode(
			admin.client.instance.setUserRole({ userId: "nobody", role: "user" }),
			"NOT_FOUND",
		);
		expect(await roleOf(guest.id)).toBe("guest");
		expect(await roleOf(admin.id)).toBe("admin");
	});
});

describe("invite links", () => {
	test("anyone with the link can see what it's for, and nothing more", async () => {
		const { token } = await newInvite("guest");
		expect(await clientFor().workspaceInvites.preview({ token })).toEqual({
			workspaceName: "Invite tests",
			role: "guest",
		});
	});

	test("a made-up token shows nothing", () =>
		expectCode(
			clientFor().workspaceInvites.preview({ token: "made-up" }),
			"NOT_FOUND",
		));

	test("only the token's hash is stored", async () => {
		const { id, token } = await newInvite();
		const row = (
			await sql`SELECT tokenHash FROM auth_space_invite WHERE id = ${id}`
		)[0] as { tokenHash: string };
		expect(row.tokenHash).not.toContain(token);
		expect(row.tokenHash).toHaveLength(64);
	});

	test("the list doesn't expose tokens or hashes", async () => {
		await newInvite();
		const invites = await admin.client.workspaceInvites.find({
			workspaceId: WORKSPACE,
		});
		expect(JSON.stringify(invites)).not.toContain("tokenHash");
		expect(Object.keys(invites[0] ?? {}).sort()).toEqual([
			"createdAt",
			"email",
			"expiresAt",
			"id",
			"role",
		]);
	});

	test("a link lets someone sign up and join with its role", async () => {
		const { token } = await newInvite("guest");
		const user = await signUp("joiner", token);

		const { workspaceId } = await user.client.workspaceInvites.accept({
			token,
		});

		expect(workspaceId).toBe(WORKSPACE);
		const members = await admin.client.workspaceMembers.find({
			workspaceId: WORKSPACE,
		});
		expect(members.find((member) => member.userId === user.id)?.role).toBe(
			"guest",
		);
	});

	test("a link works only once", async () => {
		const { token } = await newInvite();
		const first = await signUp("once-a", token);
		await first.client.workspaceInvites.accept({ token });

		await expectCode(signUp("once-b", token), "FORBIDDEN");
		await expectCode(
			first.client.workspaceInvites.accept({ token }),
			"NOT_FOUND",
		);
	});

	test("accepting at the same time only succeeds once", async () => {
		const { token } = await newInvite();
		const a = await signUp("race-a", token);
		const b = await signUp("race-b", token);

		const results = await Promise.allSettled([
			a.client.workspaceInvites.accept({ token }),
			b.client.workspaceInvites.accept({ token }),
		]);

		expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
	});

	test("expired and revoked links stop working", async () => {
		const expired = await newInvite();
		await sql`UPDATE auth_space_invite SET expiresAt = 1 WHERE id = ${expired.id}`;
		await expectCode(signUp("late", expired.token), "FORBIDDEN");
		await expectCode(
			clientFor().workspaceInvites.preview({ token: expired.token }),
			"NOT_FOUND",
		);

		const revoked = await newInvite();
		await admin.client.workspaceInvites.cancel({ inviteId: revoked.id });
		await expectCode(signUp("revoked", revoked.token), "FORBIDDEN");
	});

	test("an invite from before links can't be accepted", async () => {
		const legacyId = crypto.randomUUID();
		await sql`
			INSERT INTO auth_space_invite
				(id, spaceId, email, role, invitedByUserId, createdAt, acceptedAt, tokenHash, expiresAt)
			VALUES
				(${legacyId}, ${WORKSPACE}, 'old@example.test', 'admin', ${admin.id}, 1, NULL, NULL, 0)
		`;
		const invites = await admin.client.workspaceInvites.find({
			workspaceId: WORKSPACE,
		});
		expect(invites.map((invite) => invite.id)).not.toContain(legacyId);
	});

	test("an existing member can't use up a link", async () => {
		const { token } = await newInvite();
		await expectCode(
			admin.client.workspaceInvites.accept({ token }),
			"CONFLICT",
		);
		expect(
			(await clientFor().workspaceInvites.preview({ token })).workspaceName,
		).toBe("Invite tests");
	});

	test("only workspace admins can create or list links", async () => {
		const { token } = await newInvite("member");
		const member = await signUp("plain-member", token);
		await member.client.workspaceInvites.accept({ token });

		await expectCode(
			member.client.workspaceInvites.create({
				workspaceId: WORKSPACE,
				role: "admin",
			}),
			"FORBIDDEN",
		);
		await expectCode(
			member.client.workspaceInvites.find({ workspaceId: WORKSPACE }),
			"FORBIDDEN",
		);
	});

	test("a workspace can't take a name that clashes with the invite route", async () => {
		await expectCode(
			admin.client.workspace.create({ name: "Invite" }),
			"BAD_REQUEST",
		);
	});
});
