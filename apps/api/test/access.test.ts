import { beforeAll, describe, expect, test } from "bun:test";
import { createRouterClient } from "@orpc/server";

// Imported dynamically so setup.ts points the database at a temp file first.
await import("./setup");
const { Auth } = await import("@smelp/auth");
const { DB } = await import("@smelp/db");
const { handler, router } = await import("../src/router");

const sql = new DB().sqlite;
const auth = new Auth();
const PASSWORD = "correct-horse-battery";

function clientFor(token?: string, ip = "198.51.100.1") {
	const headers = new Headers(
		token ? { cookie: `auth_session=${token}` } : undefined,
	);
	return createRouterClient(router, { context: { headers, ip } });
}
type Client = ReturnType<typeof clientFor>;

let userCount = 0;
async function createUser(name: string) {
	userCount += 1;
	const email = `${name}-${userCount}@example.test`;
	const { session, user } = await auth.signUp(
		email,
		name,
		`${name}-${userCount}`,
		PASSWORD,
	);
	return {
		id: user.id,
		email,
		client: clientFor(session.authSessionToken),
	};
}

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

function first<T>(items: T[]): T {
	const [item] = items;
	if (item === undefined) throw new Error("Expected at least one item");
	return item;
}

const expectCode = (call: Promise<unknown>, code: string) =>
	expect(call).rejects.toMatchObject({ code });

const WORKSPACE = "acme_corp";
const PUBLIC_PROJECT = "PUB";
const PRIVATE_PROJECT = "PRIV";

let owner: Awaited<ReturnType<typeof createUser>>;
let outsider: Awaited<ReturnType<typeof createUser>>;
let workspaceGuest: Awaited<ReturnType<typeof createUser>>;
let workspaceMember: Awaited<ReturnType<typeof createUser>>;
let projectGuest: Awaited<ReturnType<typeof createUser>>;
let instanceAdmin: Awaited<ReturnType<typeof createUser>>;
let stateId: string;
let issueId: string;

const anonymous = clientFor();

beforeAll(async () => {
	owner = await createUser("owner");
	outsider = await createUser("outsider");
	workspaceGuest = await createUser("wsguest");
	workspaceMember = await createUser("wsmember");
	projectGuest = await createUser("pguest");
	instanceAdmin = await createUser("admin");
	await sql`UPDATE auth_user SET role = 'admin' WHERE id = ${instanceAdmin.id}`;

	await owner.client.workspace.create({ name: "Acme Corp" });
	await addMember(WORKSPACE, workspaceGuest.id, "guest");
	await addMember(WORKSPACE, workspaceMember.id, "member");
	await addMember(WORKSPACE, projectGuest.id, "member");

	for (const [id, access] of [
		[PUBLIC_PROJECT, "public"],
		[PRIVATE_PROJECT, "private"],
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
	await addMember(PUBLIC_PROJECT, projectGuest.id, "guest");

	const states = await owner.client.states.find({ projectId: PUBLIC_PROJECT });
	stateId = first(states).id;
	const issue = await owner.client.issue.create({
		title: "First",
		description: "",
		state: stateId,
		workspaceId: WORKSPACE,
		projectId: PUBLIC_PROJECT,
	});
	issueId = issue.id;
});

const newIssue = () => ({
	title: "New",
	description: "",
	state: stateId,
	workspaceId: WORKSPACE,
	projectId: PUBLIC_PROJECT,
});

const newProject = (id: string) => ({
	id,
	name: `Project ${id}`,
	description: "",
	access: "public" as const,
	icon: "AppWindowIcon",
	workspaceId: WORKSPACE,
});

describe("signed-out callers are rejected", () => {
	const cases: [string, (client: Client) => Promise<unknown>][] = [
		["issue.find", (c) => c.issue.find({ issueId })],
		["issues.find", (c) => c.issues.find({ projectId: PUBLIC_PROJECT })],
		["states.find", (c) => c.states.find({ projectId: PUBLIC_PROJECT })],
		["workspaces.find", (c) => c.workspaces.find()],
		["projects.find", (c) => c.projects.find({ workspaceId: WORKSPACE })],
		["issue.update", (c) => c.issue.update({ id: issueId, state: stateId })],
		["issue.create", (c) => c.issue.create(newIssue())],
		["project.create", (c) => c.project.create(newProject("ANON"))],
		["project.join", (c) => c.project.join({ projectId: PUBLIC_PROJECT })],
	];

	for (const [name, call] of cases) {
		test(name, () => expectCode(call(anonymous), "UNAUTHORIZED"));
	}

	test("a missing issue looks the same as an existing one", () =>
		expectCode(anonymous.issue.find({ issueId: "NOPE-1" }), "UNAUTHORIZED"));
});

describe("users from another workspace are rejected", () => {
	const cases: [string, (client: Client) => Promise<unknown>][] = [
		["issue.find", (c) => c.issue.find({ issueId })],
		["issues.find", (c) => c.issues.find({ projectId: PUBLIC_PROJECT })],
		["states.find", (c) => c.states.find({ projectId: PUBLIC_PROJECT })],
		["projects.find", (c) => c.projects.find({ workspaceId: WORKSPACE })],
		["issue.update", (c) => c.issue.update({ id: issueId, state: stateId })],
		["issue.create", (c) => c.issue.create(newIssue())],
		["project.create", (c) => c.project.create(newProject("OUT"))],
		["project.join", (c) => c.project.join({ projectId: PUBLIC_PROJECT })],
	];

	for (const [name, call] of cases) {
		test(name, () => expectCode(call(outsider.client), "FORBIDDEN"));
	}

	test("workspaces.find only returns their own workspaces", async () => {
		expect(await outsider.client.workspaces.find()).toEqual([]);
		const mine = await owner.client.workspaces.find();
		expect(mine.map((workspace) => workspace.id)).toEqual([WORKSPACE]);
	});
});

describe("project guests can read but not write", () => {
	test("can read issues and states", async () => {
		const c = projectGuest.client;
		expect((await c.issue.find({ issueId })).id).toBe(issueId);
		expect(await c.issues.find({ projectId: PUBLIC_PROJECT })).not.toBeEmpty();
		expect(await c.states.find({ projectId: PUBLIC_PROJECT })).not.toBeEmpty();
	});

	test("can't change issues", async () => {
		const c = projectGuest.client;
		await expectCode(
			c.issue.update({ id: issueId, state: stateId }),
			"FORBIDDEN",
		);
		await expectCode(c.issue.create(newIssue()), "FORBIDDEN");
	});
});

describe("workspace guests", () => {
	test("can list projects", async () => {
		const projects = await workspaceGuest.client.projects.find({
			workspaceId: WORKSPACE,
		});
		expect(projects.map((project) => project.id)).toEqual([PUBLIC_PROJECT]);
	});

	test("can't create projects or join their way to write access", async () => {
		const c = workspaceGuest.client;
		await expectCode(c.project.create(newProject("GST")), "FORBIDDEN");
		await expectCode(
			c.project.join({ projectId: PUBLIC_PROJECT }),
			"FORBIDDEN",
		);
	});
});

describe("workspace members outside a project", () => {
	test("don't see private projects", async () => {
		const projects = await workspaceMember.client.projects.find({
			workspaceId: WORKSPACE,
		});
		expect(projects.map((project) => project.id)).toEqual([PUBLIC_PROJECT]);
		expect(first(projects).isMember).toBe(false);
	});

	test("can't read a project's issues until they join", async () => {
		const c = workspaceMember.client;
		await expectCode(c.issue.find({ issueId }), "FORBIDDEN");
		await expectCode(c.issues.find({ projectId: PUBLIC_PROJECT }), "FORBIDDEN");
	});

	test("can't join a private project", () =>
		expectCode(
			workspaceMember.client.project.join({ projectId: PRIVATE_PROJECT }),
			"FORBIDDEN",
		));

	test("can join a public project, then read it", async () => {
		const c = workspaceMember.client;
		await c.project.join({ projectId: PUBLIC_PROJECT });
		expect((await c.issue.find({ issueId })).id).toBe(issueId);
	});
});

describe("project members", () => {
	test("can create and move issues", async () => {
		const c = owner.client;
		const states = await c.states.find({ projectId: PUBLIC_PROJECT });
		const issue = await c.issue.create(newIssue());
		const target = first(states.slice(1));
		const moved = await c.issue.update({ id: issue.id, state: target.id });
		expect(moved.state).toBe(target.id);
	});

	test("can't use a state from another project", async () => {
		const c = owner.client;
		const foreign = first(await c.states.find({ projectId: PRIVATE_PROJECT }));
		await expectCode(
			c.issue.update({ id: issueId, state: foreign.id }),
			"BAD_REQUEST",
		);
		await expectCode(
			c.issue.create({ ...newIssue(), state: foreign.id }),
			"BAD_REQUEST",
		);
	});

	test("can't file an issue under a different workspace", async () => {
		const issue = await owner.client.issue.create({
			...newIssue(),
			workspaceId: "someone_elses_workspace",
		});
		expect(issue.workspaceId).toBe(WORKSPACE);
	});

	test("get NOT_FOUND for an issue that doesn't exist", () =>
		expectCode(owner.client.issue.find({ issueId: "NOPE-1" }), "NOT_FOUND"));
});

describe("instance admins", () => {
	test("can see private projects", async () => {
		const projects = await instanceAdmin.client.projects.find({
			workspaceId: WORKSPACE,
		});
		expect(projects.map((project) => project.id).sort()).toEqual([
			PRIVATE_PROJECT,
			PUBLIC_PROJECT,
		]);
	});
});

describe("rate limits", () => {
	test("repeated failed sign-ins are blocked", async () => {
		const user = await createUser("target");
		const attacker = clientFor(undefined, "203.0.113.5");
		const attempt = (password: string) =>
			attacker.auth.signIn({ email: user.email, password });

		for (let i = 0; i < 10; i++) {
			await expectCode(attempt("wrong-password"), "UNAUTHORIZED");
		}
		await expectCode(attempt(PASSWORD), "TOO_MANY_REQUESTS");

		// The real owner, on another network, isn't locked out.
		const result = await clientFor(undefined, "203.0.113.6").auth.signIn({
			email: user.email,
			password: PASSWORD,
		});
		expect(result.user.email).toBe(user.email);
	});

	test("a successful sign-in clears failed attempts", async () => {
		const user = await createUser("forgetful");
		const person = clientFor(undefined, "203.0.113.7");
		const attempt = (password: string) =>
			person.auth.signIn({ email: user.email, password });

		for (let round = 0; round < 2; round++) {
			for (let i = 0; i < 9; i++) {
				await expectCode(attempt("wrong-password"), "UNAUTHORIZED");
			}
			await attempt(PASSWORD);
		}
	});

	test("repeated sign-ups from one address are blocked", async () => {
		await sql`UPDATE instance_setting SET value = 'true' WHERE key = 'signupOpen'`;
		const bot = clientFor(undefined, "203.0.113.8");
		const signUp = (i: number) =>
			bot.auth.signUp({
				email: `bot-${i}@example.test`,
				fullName: "Bot",
				displayName: `bot-${i}`,
				password: PASSWORD,
			});

		for (let i = 0; i < 10; i++) await signUp(i);
		await expectCode(signUp(10), "TOO_MANY_REQUESTS");
		await sql`UPDATE instance_setting SET value = 'false' WHERE key = 'signupOpen'`;
	});
});

describe("CORS", () => {
	const preflightFrom = async (origin: string) => {
		const request = new Request("http://localhost/rpc/workspaces/find", {
			method: "OPTIONS",
			headers: { origin, "access-control-request-method": "POST" },
		});
		const { response } = await handler.handle(request, {
			prefix: "/rpc",
			context: { headers: request.headers, ip: "198.51.100.2" },
		});
		return response?.headers.get("access-control-allow-origin");
	};

	test("doesn't allow an unlisted origin", async () => {
		expect(await preflightFrom("https://evil.example.test")).toBeNull();
	});

	test("allows a listed origin", async () => {
		expect(await preflightFrom("https://app.example.test")).toBe(
			"https://app.example.test",
		);
	});
});
