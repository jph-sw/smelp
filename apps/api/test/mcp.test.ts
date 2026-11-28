import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createRouterClient } from "@orpc/server";

// Imported dynamically so setup.ts points the database at a temp file first.
await import("./setup");
const { Auth } = await import("@smelp/auth");
const { DB } = await import("@smelp/db");
const { router } = await import("../src/router");
const { mcpResponse } = await import("../src/lib/mcp");

const sql = new DB().sqlite;
const auth = new Auth();

const ENDPOINT = "http://smelp.test/mcp";
const PROJECT = "MCP";
const HIDDEN_PROJECT = "HID";

const clientWith = (headers: Headers) =>
	createRouterClient(router, { context: { headers, ip: "198.18.5.1" } });

let counter = 0;
async function createUser(displayName: string) {
	counter += 1;
	const { session, user } = await auth.signUp(
		`mcp-${counter}@example.test`,
		`${displayName} Person`,
		displayName,
		"correct-horse-battery",
	);
	const headers = new Headers({
		cookie: `auth_session=${session.authSessionToken}`,
	});
	const client = clientWith(headers);
	const { token } = await client.apiTokens.create({
		name: "Agent",
		expiresInDays: null,
	});
	return { id: user.id, displayName, headers, client, token };
}
type User = Awaited<ReturnType<typeof createUser>>;

const post = (headers: Record<string, string>) =>
	mcpResponse(
		new Request(ENDPOINT, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				accept: "application/json, text/event-stream",
				...headers,
			},
			body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
		}),
		"198.18.5.1",
	);

const clients: Client[] = [];
async function connect(token: string) {
	const client = new Client({ name: "test-agent", version: "1.0.0" });
	await client.connect(
		new StreamableHTTPClientTransport(new URL(ENDPOINT), {
			requestInit: { headers: { authorization: `Bearer ${token}` } },
			fetch: (url, init) =>
				mcpResponse(new Request(String(url), init), "198.18.5.1"),
		}),
	);
	clients.push(client);
	return client;
}

type ToolResult = { isError?: boolean; content: { text: string }[] };

async function call(client: Client, name: string, args = {}) {
	const result = (await client.callTool({
		name,
		arguments: args,
	})) as ToolResult;
	return { isError: result.isError ?? false, text: result.content[0]?.text };
}

async function value(client: Client, name: string, args = {}) {
	const result = await call(client, name, args);
	if (result.isError) throw new Error(`${name} failed: ${result.text}`);
	return JSON.parse(result.text ?? "");
}

let ada: User;
let grace: User;
let outsider: User;
let workspaceId: string;
let agent: Client;

beforeAll(async () => {
	ada = await createUser("Ada");
	grace = await createUser("Grace");
	outsider = await createUser("Outsider");

	const workspace = await ada.client.workspace.create({ name: "MCP tests" });
	workspaceId = workspace.id;
	await ada.client.project.create({
		id: PROJECT,
		name: "Agents",
		description: "",
		access: "private",
		icon: "AppWindowIcon",
		workspaceId,
	});
	for (const spaceId of [workspaceId, PROJECT]) {
		await sql`INSERT INTO auth_space_member ${sql({
			id: crypto.randomUUID(),
			spaceId,
			userId: grace.id,
			role: "member",
			createdAt: Date.now(),
		})}`;
	}

	const hidden = await outsider.client.workspace.create({
		name: "MCP hidden",
	});
	await outsider.client.project.create({
		id: HIDDEN_PROJECT,
		name: "Hidden",
		description: "",
		access: "private",
		icon: "AppWindowIcon",
		workspaceId: hidden.id,
	});

	agent = await connect(ada.token);
});

afterAll(async () => {
	await Promise.all(clients.map((client) => client.close()));
});

describe("signing in", () => {
	test("needs a valid bearer token", async () => {
		const cookie = ada.headers.get("cookie") ?? "";
		for (const headers of <Record<string, string>[]>[
			{},
			{ authorization: "Bearer smelp_not-a-real-token" },
			{ authorization: "Basic YWRhOnB3" },
			{ cookie },
		]) {
			const response = await post(headers);
			expect(response.status).toBe(401);
			expect(response.headers.get("www-authenticate")).toContain(
				'resource_metadata="http://smelp.test/.well-known/oauth-protected-resource/mcp"',
			);
		}

		const response = await post({ authorization: `Bearer ${ada.token}` });
		expect(response.status).toBe(200);
	});

	test("serves only POST, since there are no sessions or streams", async () => {
		for (const method of ["GET", "DELETE"]) {
			const response = await mcpResponse(
				new Request(ENDPOINT, {
					method,
					headers: {
						authorization: `Bearer ${ada.token}`,
						accept: "text/event-stream",
					},
				}),
				"198.18.5.1",
			);
			expect(response.status).toBe(405);
		}
	});

	test("whoami is the token's owner", async () => {
		expect(await value(agent, "whoami")).toEqual({
			name: "Ada",
			fullName: "Ada Person",
			email: expect.stringMatching(/@example\.test$/),
		});
		const other = await connect(grace.token);
		expect((await value(other, "whoami")).name).toBe("Grace");
	});

	test("auth.me answers to the token too", async () => {
		const client = clientWith(
			new Headers({ authorization: `Bearer ${ada.token}` }),
		);
		expect((await client.auth.me()).user.id).toBe(ada.id);
	});
});

test("lists the tools an agent works with", async () => {
	const { tools } = await agent.listTools();
	expect(tools.map((tool) => tool.name).sort()).toEqual([
		"add_comment",
		"create_project",
		"create_work_item",
		"create_workspace",
		"get_work_item",
		"list_my_work_items",
		"list_projects",
		"list_states",
		"list_workspaces",
		"search_work_items",
		"update_work_item",
		"whoami",
	]);
	for (const tool of tools) expect(tool.description).toBeTruthy();
});

test("finds workspaces, projects and states", async () => {
	expect(await value(agent, "list_workspaces")).toEqual([
		{ id: workspaceId, name: "MCP tests" },
	]);
	const projects = await value(agent, "list_projects");
	expect(projects.map((project: { key: string }) => project.key)).toEqual([
		PROJECT,
	]);
	const states = await value(agent, "list_states", { project: PROJECT });
	expect(states.map((state: { name: string }) => state.name)).toEqual([
		"Backlog",
		"Todo",
		"In Progress",
		"Done",
	]);
});

describe("working on an item", () => {
	test("create, read, update and comment by key, in Markdown", async () => {
		const description = "## Steps\n\n- open the board\n- **drag** a card";
		const created = await value(agent, "create_work_item", {
			project: PROJECT,
			title: "Wire up the agent",
			description,
			assignee: "grace",
		});
		expect(created.key).toMatch(/^MCP-\d+$/);
		expect(created).toMatchObject({
			title: "Wire up the agent",
			state: "Backlog",
			assignee: "Grace",
			project: PROJECT,
			description,
			comments: [],
		});
		expect(created.url).toBe(
			`http://smelp.test/${workspaceId}/browse/${created.key}`,
		);

		const updated = await value(agent, "update_work_item", {
			key: created.key,
			state: "in progress",
			title: "Wire up the MCP agent",
		});
		expect(updated).toMatchObject({
			key: created.key,
			title: "Wire up the MCP agent",
			state: "In Progress",
			assignee: "Grace",
			description,
		});

		const comment = "Looks good, see `mcp.ts`.";
		await value(agent, "add_comment", { key: created.key, body: comment });

		const item = await value(agent, "get_work_item", { key: created.key });
		expect(item.state).toBe("In Progress");
		expect(item.comments).toEqual([
			{ author: "Ada", createdAt: expect.any(String), body: comment },
		]);

		const stored = await ada.client.issue.find({ issueId: created.key });
		expect(stored.description).toBe(description);
		expect(stored.createdBy).toBe(ada.id);
	});

	test("names the item's labels", async () => {
		const created = await value(agent, "create_work_item", {
			project: PROJECT,
			title: "Tagged for the agent",
		});
		expect(created.labels).toEqual([]);
		const labelIds = [];
		for (const name of ["urgent-fix", "Backend"]) {
			const label = await ada.client.labels.create({
				projectId: PROJECT,
				name,
				color: "#336699",
			});
			labelIds.push(label.id);
		}
		await ada.client.issue.setLabels({ id: created.key, labelIds });
		const item = await value(agent, "get_work_item", { key: created.key });
		expect(item.labels).toEqual(["Backend", "urgent-fix"]);
	});

	test("unassigns with null, and shows up for the assignee", async () => {
		const created = await value(agent, "create_work_item", {
			project: PROJECT,
			title: "Assigned to Grace",
			assignee: "Grace",
		});
		const forGrace = await connect(grace.token);
		const mine = await value(forGrace, "list_my_work_items");
		expect(mine.map((item: { key: string }) => item.key)).toContain(
			created.key,
		);

		const updated = await value(agent, "update_work_item", {
			key: created.key,
			assignee: null,
		});
		expect(updated.assignee).toBeNull();
	});

	test("sets and changes the type", async () => {
		const task = await value(agent, "create_work_item", {
			project: PROJECT,
			title: "Plain work",
		});
		expect(task.type).toBe("task");

		const bug = await value(agent, "create_work_item", {
			project: PROJECT,
			title: "It crashes",
			type: "bug",
		});
		expect(bug.type).toBe("bug");

		const story = await value(agent, "update_work_item", {
			key: bug.key,
			type: "story",
		});
		expect(story.type).toBe("story");
		expect((await ada.client.issue.find({ issueId: bug.key })).type).toBe(
			"story",
		);

		const refused = await call(agent, "update_work_item", {
			key: bug.key,
			type: "incident",
		});
		expect(refused.isError).toBe(true);
	});

	test("sets and changes the priority", async () => {
		const plain = await value(agent, "create_work_item", {
			project: PROJECT,
			title: "Whenever",
		});
		expect(plain.priority).toBe("none");

		const high = await value(agent, "create_work_item", {
			project: PROJECT,
			title: "Soon please",
			priority: "high",
		});
		expect(high.priority).toBe("high");

		const urgent = await value(agent, "update_work_item", {
			key: high.key,
			priority: "urgent",
		});
		expect(urgent.priority).toBe("urgent");
		expect((await ada.client.issue.find({ issueId: high.key })).priority).toBe(
			"urgent",
		);

		const refused = await call(agent, "update_work_item", {
			key: high.key,
			priority: "p0",
		});
		expect(refused.isError).toBe(true);
	});

	test("sets, shows and clears the due date", async () => {
		const created = await value(agent, "create_work_item", {
			project: PROJECT,
			title: "Ship by Friday",
			dueDate: "2026-11-20",
		});
		expect(created.dueDate).toBe("2026-11-20");
		expect(
			(await value(agent, "get_work_item", { key: created.key })).dueDate,
		).toBe("2026-11-20");

		const cleared = await value(agent, "update_work_item", {
			key: created.key,
			dueDate: null,
		});
		expect(cleared.dueDate).toBeNull();

		const refused = await call(agent, "update_work_item", {
			key: created.key,
			dueDate: "2026-02-30",
		});
		expect(refused.isError).toBe(true);
	});

	test("sets, changes and clears the estimate", async () => {
		const created = await value(agent, "create_work_item", {
			project: PROJECT,
			title: "Estimate me",
			estimate: 0.5,
		});
		expect(created.estimate).toBe(0.5);

		const changed = await value(agent, "update_work_item", {
			key: created.key,
			estimate: 13,
		});
		expect(changed.estimate).toBe(13);
		expect(
			(await value(agent, "get_work_item", { key: created.key })).estimate,
		).toBe(13);

		const cleared = await value(agent, "update_work_item", {
			key: created.key,
			estimate: null,
		});
		expect(cleared.estimate).toBeNull();

		const refused = await call(agent, "update_work_item", {
			key: created.key,
			estimate: -2,
		});
		expect(refused.isError).toBe(true);
	});

	test("search finds items by title or key", async () => {
		const created = await value(agent, "create_work_item", {
			project: PROJECT,
			title: "Searchable needle",
		});
		const byTitle = await value(agent, "search_work_items", {
			query: "needle",
		});
		expect(byTitle.map((item: { key: string }) => item.key)).toEqual([
			created.key,
		]);
		const byKey = await value(agent, "search_work_items", {
			query: created.key,
			project: PROJECT,
		});
		expect(byKey[0].title).toBe("Searchable needle");
	});
});

describe("setting up a workspace", () => {
	let founder: User;
	let founderAgent: Client;

	beforeAll(async () => {
		founder = await createUser("Founder");
		founderAgent = await connect(founder.token);
	});

	test("creates a workspace and a project to work in", async () => {
		const workspace = await value(founderAgent, "create_workspace", {
			name: "Fresh Start",
		});
		expect(workspace).toEqual({ id: "fresh_start", name: "Fresh Start" });
		expect(await value(founderAgent, "list_workspaces")).toEqual([workspace]);

		const project = await value(founderAgent, "create_project", {
			workspace: workspace.id,
			key: "NEW",
			name: "Brand new",
		});
		expect(project).toEqual({
			key: "NEW",
			name: "Brand new",
			description: "",
			workspace: workspace.id,
			archived: false,
			member: true,
		});
		expect(
			await value(founderAgent, "list_projects", { workspace: workspace.id }),
		).toEqual([project]);
		expect(
			(await founder.client.project.find({ projectId: "NEW" })).access,
		).toBe("public");

		const states = await value(founderAgent, "list_states", { project: "NEW" });
		expect(states.map((state: { name: string }) => state.name)).toEqual([
			"Backlog",
			"Todo",
			"In Progress",
			"Done",
		]);

		const item = await value(founderAgent, "create_work_item", {
			project: "NEW",
			title: "First thing",
		});
		expect(item).toMatchObject({ key: "NEW-1", state: "Backlog" });
	});

	test("a project only goes in a workspace the caller can write to", async () => {
		const result = await call(founderAgent, "create_project", {
			workspace: workspaceId,
			key: "SNK",
			name: "Sneaky",
		});
		expect(result.isError).toBe(true);
		expect(result.text).toMatch(/Forbidden|Not Found/);
		expect(await ada.client.projects.find({ workspaceId })).not.toContainEqual(
			expect.objectContaining({ id: "SNK" }),
		);
	});

	test("a taken project key says the key is taken", async () => {
		const result = await call(agent, "create_project", {
			workspace: workspaceId,
			key: HIDDEN_PROJECT,
			name: "Copycat",
		});
		expect(result.isError).toBe(true);
		expect(result.text).toContain(`The project key ${HIDDEN_PROJECT} is taken`);
		expect(result.text).not.toContain("name");
	});

	test("needs a confirmed email while email is on", async () => {
		const user = await createUser("Unverified");
		await sql`UPDATE auth_user SET emailVerified = 0 WHERE id = ${user.id}`;
		const unverified = await connect(user.token);
		const saved = { ...process.env };
		Object.assign(process.env, {
			SMTP_HOST: "127.0.0.1",
			SMTP_FROM: "smelp <smelp@example.test>",
			APP_URL: "http://smelp.test",
		});
		try {
			const result = await call(unverified, "create_workspace", {
				name: "Not yet",
			});
			expect(result.isError).toBe(true);
			expect(result.text).toContain("Confirm your email address");
		} finally {
			for (const name of ["SMTP_HOST", "SMTP_FROM", "APP_URL"]) {
				if (saved[name] === undefined) delete process.env[name];
				else process.env[name] = saved[name];
			}
		}
	});
});

describe("errors come back as tool errors", () => {
	test("an unknown state lists the valid ones", async () => {
		const result = await call(agent, "create_work_item", {
			project: PROJECT,
			title: "Nowhere",
			state: "Shipping",
		});
		expect(result.isError).toBe(true);
		expect(result.text).toContain("Backlog, Todo, In Progress, Done");
	});

	test("an unknown assignee lists the members", async () => {
		const result = await call(agent, "create_work_item", {
			project: PROJECT,
			title: "Nobody",
			assignee: "Linus",
		});
		expect(result.isError).toBe(true);
		expect(result.text).toContain("Ada");
		expect(result.text).toContain("Grace");
	});

	test("a project or item the caller can't see", async () => {
		const hidden = await outsider.client.issue.create({
			title: "Secret",
			description: "",
			state: (
				await outsider.client.states.find({ projectId: HIDDEN_PROJECT })
			)[0]?.id as string,
			workspaceId: (
				await outsider.client.project.find({ projectId: HIDDEN_PROJECT })
			).workspaceId,
			projectId: HIDDEN_PROJECT,
		});

		for (const [name, args] of [
			["get_work_item", { key: hidden.id }],
			["add_comment", { key: hidden.id, body: "Let me in" }],
			["create_work_item", { project: HIDDEN_PROJECT, title: "Sneaky" }],
			["list_states", { project: HIDDEN_PROJECT }],
			["get_work_item", { key: "MCP-9999" }],
		] as const) {
			const result = await call(agent, name, args);
			expect(result.isError).toBe(true);
			expect(result.text).toMatch(/Forbidden|Not Found/);
		}
		expect(await outsider.client.comments.find({ issueId: hidden.id })).toEqual(
			[],
		);
	});

	test("input the API refuses says why", async () => {
		const result = await call(agent, "create_work_item", {
			project: PROJECT,
			title: "x".repeat(121),
		});
		expect(result.isError).toBe(true);
		expect(result.text).toContain("Input validation failed");
	});
});
