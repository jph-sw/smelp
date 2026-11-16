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
const { notificationsIdle } = await import("../src/lib/notifications");

const sql = new DB().sqlite;
const auth = new Auth();

// A small real SMTP server, so these tests cover what actually goes over the wire.
type Message = { from: string; to: string[]; raw: string; text: string };
const received: Message[] = [];
let failNextData = false;

const decode = (raw: string) =>
	raw
		.replace(/=\r?\n/g, "")
		.replace(/=([0-9A-F]{2})/g, (_, hex) =>
			String.fromCharCode(Number.parseInt(hex, 16)),
		);

type State = { buffer: string; inData: boolean; from: string; to: string[] };
const smtp = Bun.listen<State>({
	hostname: "127.0.0.1",
	port: 0,
	socket: {
		open(socket) {
			socket.data = { buffer: "", inData: false, from: "", to: [] };
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
					if (failNextData) {
						failNextData = false;
						socket.write("554 rejected\r\n");
						continue;
					}
					received.push({
						from: state.from,
						to: state.to,
						raw,
						text: decode(raw),
					});
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
				else if (verb === "MAIL") {
					state.from = line;
					socket.write("250 ok\r\n");
				} else if (verb === "RCPT") {
					state.to.push(line);
					socket.write("250 ok\r\n");
				} else if (verb === "DATA") {
					state.inData = true;
					socket.write("354 go\r\n");
				} else if (verb === "STAR") {
					// Like a real server without TLS support.
					socket.write("502 not supported\r\n");
				} else if (verb === "QUIT") {
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
	"SMTP_USER",
	"SMTP_PASSWORD",
	"SMTP_SECURE",
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
	return `198.18.3.${counter % 250}`;
};
async function createUser(role?: "admin") {
	counter += 1;
	const email = `mail-${counter}@example.test`;
	const { session, user } = await auth.signUp(
		email,
		`Mail ${counter}`,
		`mail-${counter}`,
		"correct-horse-battery",
	);
	if (role)
		await sql`UPDATE auth_user SET role = ${role} WHERE id = ${user.id}`;
	return {
		id: user.id,
		email,
		displayName: user.displayName,
		client: createRouterClient(router, {
			context: {
				headers: new Headers({
					cookie: `auth_session=${session.authSessionToken}`,
				}),
				ip: nextIp(),
			},
		}),
	};
}
const publicClient = (ip = nextIp(), host = "smelp.example.test") =>
	createRouterClient(router, {
		context: { headers: new Headers({ host }), ip },
	});

const waitForMail = async (count: number) => {
	for (let i = 0; i < 100 && received.length < count; i += 1) {
		await Bun.sleep(20);
	}
	expect(received.length).toBe(count);
};
const linkIn = (message: Message | undefined, path: string) => {
	const match = message?.text.match(
		new RegExp(`https://smelp\\.example\\.test/${path}/([A-Za-z0-9_-]+)`),
	);
	if (!match?.[1]) throw new Error(`No ${path} link in email`);
	return match[1];
};

beforeAll(clearMailEnv);
beforeEach(() => {
	received.length = 0;
	failNextData = false;
	turnMailOn();
});
afterEach(clearMailEnv);
afterAll(() => smtp.stop(true));

describe("with email off", () => {
	beforeEach(clearMailEnv);

	test("invites still work and nothing is sent", async () => {
		const admin = await createUser();
		const { id: workspaceId } = await admin.client.workspace.create({
			name: `Off ${counter}`,
		});
		const invite = await admin.client.workspaceInvites.create({
			workspaceId,
			email: "someone@example.test",
			role: "member",
		});
		expect(invite.emailDelivery).toBe("none");
		expect(invite.token).toBeTruthy();
		expect(received.length).toBe(0);
	});

	test("reset links still work and nothing is sent", async () => {
		const admin = await createUser("admin");
		const user = await createUser();
		const reset = await admin.client.instance.createPasswordReset({
			userId: user.id,
		});
		expect(reset.emailDelivery).toBe("none");
		expect(reset.token).toBeTruthy();
	});

	test("the status says so", async () => {
		expect((await publicClient().instance.status()).emailEnabled).toBe(false);
	});

	test("self-service reset and test email explain why they can't run", async () => {
		const admin = await createUser("admin");
		expect(
			publicClient().auth.requestPasswordReset({ email: admin.email }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(admin.client.instance.sendTestEmail()).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
	});

	test("any one missing setting keeps it off", async () => {
		for (const missing of ["SMTP_HOST", "SMTP_FROM", "APP_URL"] as const) {
			turnMailOn();
			delete process.env[missing];
			expect((await publicClient().instance.status()).emailEnabled).toBe(false);
		}
	});
});

describe("invite emails", () => {
	const setup = async () => {
		const admin = await createUser();
		const { id: workspaceId } = await admin.client.workspace.create({
			name: `Crew ${counter}`,
		});
		return { admin, workspaceId };
	};

	test("sends a working link to the invited address", async () => {
		const { admin, workspaceId } = await setup();
		const invite = await admin.client.workspaceInvites.create({
			workspaceId,
			email: "New.Person@Example.test",
			role: "member",
		});
		expect(invite.emailDelivery).toBe("sent");
		await waitForMail(1);

		const message = received[0];
		expect(message?.to[0]).toContain("new.person@example.test");
		expect(message?.text).toContain(admin.displayName);
		expect(message?.text).toContain("expires in 7 days");

		const token = linkIn(message, "invite");
		expect(token).toBe(invite.token);
		const preview = await publicClient().workspaceInvites.preview({ token });
		expect(preview).toBeTruthy();
	});

	test("no address means no email", async () => {
		const { admin, workspaceId } = await setup();
		const invite = await admin.client.workspaceInvites.create({
			workspaceId,
			role: "member",
		});
		expect(invite.emailDelivery).toBe("none");
		expect(received.length).toBe(0);
	});

	test("a rejected email keeps the invite and its link", async () => {
		const { admin, workspaceId } = await setup();
		failNextData = true;
		const invite = await admin.client.workspaceInvites.create({
			workspaceId,
			email: "bounce@example.test",
			role: "member",
		});
		expect(invite.emailDelivery).toBe("failed");
		const preview = await publicClient().workspaceInvites.preview({
			token: invite.token,
		});
		expect(preview).toBeTruthy();
	});

	test("an unreachable mail server keeps the invite and its link", async () => {
		const { admin, workspaceId } = await setup();
		process.env.SMTP_PORT = "1";
		const invite = await admin.client.workspaceInvites.create({
			workspaceId,
			email: "nowhere@example.test",
			role: "member",
		});
		expect(invite.emailDelivery).toBe("failed");
		expect(invite.token).toBeTruthy();
	});

	test("a workspace name can't add headers or recipients", async () => {
		const { admin, workspaceId } = await setup();
		await sql`UPDATE workspace SET name = ${"Crew\r\nBcc: victim@example.test"} WHERE id = ${workspaceId}`;
		await admin.client.workspaceInvites.create({
			workspaceId,
			email: "only@example.test",
			role: "member",
		});
		await waitForMail(1);
		expect(received[0]?.to.length).toBe(1);
		// Nothing, headers or body, starts a new line with the injected text.
		expect(received[0]?.raw).not.toMatch(/^Bcc:/im);
		expect(received[0]?.text).toContain(
			"Crew Bcc: victim@example.test workspace",
		);
	});

	test("won't send over an unencrypted connection unless allowed", async () => {
		const { admin, workspaceId } = await setup();
		delete process.env.SMTP_REQUIRE_TLS;
		const invite = await admin.client.workspaceInvites.create({
			workspaceId,
			email: "plain@example.test",
			role: "member",
		});
		expect(invite.emailDelivery).toBe("failed");
		expect(received.length).toBe(0);
	});

	test("stops after 30 emails an hour, while still creating invites", async () => {
		const { admin, workspaceId } = await setup();
		const results = [];
		for (let i = 0; i < 31; i += 1) {
			const invite = await admin.client.workspaceInvites.create({
				workspaceId,
				email: `flood-${i}@example.test`,
				role: "guest",
			});
			results.push(invite.emailDelivery);
		}
		expect(results.filter((r) => r === "sent").length).toBe(30);
		expect(results.at(-1)).toBe("failed");
		expect(received.length).toBe(30);
	});
});

describe("password reset emails", () => {
	test("an instance admin's reset is emailed to the user", async () => {
		const admin = await createUser("admin");
		const user = await createUser();
		const reset = await admin.client.instance.createPasswordReset({
			userId: user.id,
		});
		expect(reset.emailDelivery).toBe("sent");
		await waitForMail(1);
		expect(received[0]?.to[0]).toContain(user.email);
		expect(linkIn(received[0], "reset-password")).toBe(reset.token);
	});

	test("forgot password: the emailed link really resets it", async () => {
		const user = await createUser();
		await publicClient().auth.requestPasswordReset({
			email: `  ${user.email.toUpperCase()} `,
		});
		await waitForMail(1);
		const token = linkIn(received[0], "reset-password");

		await publicClient().auth.resetPassword({
			token,
			newPassword: "a-brand-new-password",
		});
		expect(await auth.signIn(user.email, "a-brand-new-password")).toBeTruthy();
	});

	test("links use APP_URL, not the address in the request", async () => {
		const user = await createUser();
		await publicClient(nextIp(), "evil.example.test").auth.requestPasswordReset(
			{ email: user.email },
		);
		await waitForMail(1);
		expect(received[0]?.text).not.toContain("evil.example.test");
		expect(linkIn(received[0], "reset-password")).toBeTruthy();
	});

	test("the answer doesn't reveal whether an account exists", async () => {
		const client = publicClient();
		const user = await createUser();
		const known = await client.auth.requestPasswordReset({ email: user.email });
		const unknown = await client.auth.requestPasswordReset({
			email: "nobody-here@example.test",
		});
		expect(unknown).toEqual(known);
		await waitForMail(1);
		await Bun.sleep(50);
		expect(received.length).toBe(1);
		expect(received[0]?.to[0]).toContain(user.email);
	});

	test("an address gets at most 3 emails an hour, without saying so", async () => {
		const user = await createUser();
		for (let i = 0; i < 5; i += 1) {
			await publicClient().auth.requestPasswordReset({ email: user.email });
		}
		await waitForMail(3);
		await Bun.sleep(100);
		expect(received.length).toBe(3);
	});

	test("one address making many requests gets rate limited", async () => {
		const client = publicClient("198.18.9.9");
		const results = await Promise.allSettled(
			Array.from({ length: 11 }, (_, i) =>
				client.auth.requestPasswordReset({
					email: `limited-${i}@example.test`,
				}),
			),
		);
		expect(results.filter((r) => r.status === "rejected").length).toBe(1);
	});

	test("only the newest requested link works", async () => {
		const user = await createUser();
		await publicClient().auth.requestPasswordReset({ email: user.email });
		await waitForMail(1);
		await publicClient().auth.requestPasswordReset({ email: user.email });
		await waitForMail(2);
		const [first, second] = [
			linkIn(received[0], "reset-password"),
			linkIn(received[1], "reset-password"),
		];
		expect(
			publicClient().auth.previewPasswordReset({ token: first }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(
			await publicClient().auth.previewPasswordReset({ token: second }),
		).toEqual({ email: user.email });
	});
});

describe("test email", () => {
	test("goes to the instance admin", async () => {
		const admin = await createUser("admin");
		expect(await admin.client.instance.sendTestEmail()).toEqual({
			to: admin.email,
		});
		await waitForMail(1);
		expect(received[0]?.to[0]).toContain(admin.email);
	});

	test("reports why it failed", async () => {
		const admin = await createUser("admin");
		process.env.SMTP_PORT = "1";
		await expect(admin.client.instance.sendTestEmail()).rejects.toThrow(
			"Couldn't send",
		);
	});

	test("is only for instance admins", async () => {
		const user = await createUser();
		expect(user.client.instance.sendTestEmail()).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		expect(publicClient().instance.sendTestEmail()).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
	});
});

describe("notification emails", () => {
	const setup = async (wantsEmail: boolean) => {
		const owner = await createUser();
		const person = await createUser();
		const workspaceId = `notify_mail_${counter}`;
		const projectId = `NM${counter}`;
		await owner.client.workspace.create({ name: `Notify mail ${counter}` });
		await owner.client.project.create({
			id: projectId,
			name: "Notify",
			description: "",
			access: "public",
			icon: "AppWindowIcon",
			workspaceId,
		});
		for (const spaceId of [workspaceId, projectId]) {
			await sql`INSERT INTO auth_space_member ${sql({
				id: crypto.randomUUID(),
				spaceId,
				userId: person.id,
				role: "member",
				createdAt: Date.now(),
			})}`;
		}
		const [state] = await owner.client.states.find({ projectId });
		if (wantsEmail) {
			await person.client.auth.updateNotificationPreferences({
				emailNotifications: true,
			});
		}
		const create = (title = "Mail me", assignee?: string) =>
			owner.client.issue.create({
				title,
				description: "",
				state: state?.id ?? "",
				type: "task",
				workspaceId,
				projectId,
				assignee,
			});
		const assign = (title?: string) => create(title, person.id);
		return { owner, person, workspaceId, create, assign };
	};

	test("nothing is sent unless the person turned it on", async () => {
		const { assign } = await setup(false);
		await assign();
		await notificationsIdle();
		expect(received.length).toBe(0);
	});

	test("sends a link to the item when it is on", async () => {
		const { person, workspaceId, assign } = await setup(true);
		const issue = await assign();
		await waitForMail(1);
		expect(received[0]?.to[0]).toContain(person.email);
		expect(received[0]?.text).toContain("assigned you");
		expect(received[0]?.text).toContain(
			`https://smelp.example.test/${workspaceId}/browse/${issue.id}`,
		);
	});

	test("quotes the comment under a line saying who wrote it", async () => {
		const { owner, person, create } = await setup(true);
		const issue = await create("Quoted", person.id);
		await waitForMail(1);
		await owner.client.comments.create({
			issueId: issue.id,
			body: `Line one\r\nLine two with ${`@[Admin](user:${person.id})`}`,
		});
		await waitForMail(2);
		const text = received[1]?.text ?? "";
		expect(text).toContain(`${owner.displayName} wrote:`);
		expect(text).toContain("> Line one");
		// Each line is quoted, and a mention reads as the real name behind the id.
		expect(text).toContain(`> Line two with @${person.displayName}`);
		expect(text).not.toContain("@Admin");
	});

	test("line breaks in names and titles can't add headers", async () => {
		const { owner, person, assign } = await setup(true);
		await owner.client.auth.updateProfile({
			fullName: "Mallory",
			displayName: `mal-${counter}\r\nBcc: evil@example.test`,
		});
		await assign("Title\r\nBcc: other@example.test");
		await waitForMail(1);
		const raw = received[0]?.raw ?? "";
		const headers = raw.split(/\r?\n\r?\n/)[0] ?? "";
		expect(headers).not.toMatch(/^Bcc:/im);
		const subjects = headers.match(/^Subject:/gim) ?? [];
		expect(subjects).toHaveLength(1);
		expect(received[0]?.to.join()).toContain(person.email);
		expect(received[0]?.to).toHaveLength(1);
	});

	test("a failing mail server doesn't fail the request", async () => {
		const { person, workspaceId, assign } = await setup(true);
		failNextData = true;
		const issue = await assign();
		expect(issue.assignee).toBe(person.id);
		await notificationsIdle();
		expect(received.length).toBe(0);
		// The inbox still has it.
		const { notifications } = await person.client.notifications.find({
			workspaceId,
		});
		expect(notifications).toHaveLength(1);
	});

	test("with email off the inbox still works", async () => {
		const { person, workspaceId, assign } = await setup(true);
		clearMailEnv();
		await assign();
		await notificationsIdle();
		expect(received.length).toBe(0);
		const { count } = await person.client.notifications.countUnread({
			workspaceId,
		});
		expect(count).toBe(1);
	});

	test("sends at most 20 an hour to one person and drops the rest", async () => {
		const { person, workspaceId, assign } = await setup(true);
		for (let i = 0; i < 22; i += 1) await assign(`Burst ${i}`);
		await notificationsIdle();
		expect(received.length).toBe(20);
		const { count } = await person.client.notifications.countUnread({
			workspaceId,
		});
		expect(count).toBe(22);
	});
});

test("the status endpoint never exposes mail settings", async () => {
	process.env.SMTP_USER = "login";
	process.env.SMTP_PASSWORD = "hunter2-secret";
	const status = await publicClient().instance.status();
	expect(JSON.stringify(status)).not.toContain("hunter2");
	expect(Object.keys(status).sort()).toEqual([
		"emailEnabled",
		"needsSetup",
		"publicAccess",
		"secureCookies",
		"signupOpen",
	]);
});
