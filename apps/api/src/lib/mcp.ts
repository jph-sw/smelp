import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createRouterClient, ORPCError } from "@orpc/server";
import { Utils } from "@smelp/db";
import { z } from "zod";
import { router } from "../router";
import { requireUser } from "./access";
import { version } from "./version";

const { logger } = new Utils();

const apiFor = (headers: Headers, ip: string) =>
	createRouterClient(router, { context: { headers, ip } });
type Api = ReturnType<typeof apiFor>;

type State = Awaited<ReturnType<Api["states"]["find"]>>[number];
type Member = Awaited<ReturnType<Api["projectMembers"]["find"]>>[number];

const unauthorized = () =>
	new Response(
		"Send an API token from your account page as Authorization: Bearer smelp_...",
		{ status: 401, headers: { "WWW-Authenticate": "Bearer" } },
	);

// Only a bearer token is accepted, so a browser's cookie can never make these calls.
export async function mcpResponse(
	request: Request,
	ip: string,
): Promise<Response> {
	const authorization = request.headers.get("authorization");
	if (authorization === null) return unauthorized();
	const headers = new Headers({ authorization });
	try {
		await requireUser(headers);
	} catch (error) {
		if (error instanceof ORPCError && error.code === "UNAUTHORIZED") {
			return unauthorized();
		}
		throw error;
	}

	// Stateless: every request stands alone, so there is no stream to open or session to end.
	if (request.method !== "POST") {
		return Response.json(
			{
				jsonrpc: "2.0",
				error: { code: -32000, message: "Method not allowed" },
				id: null,
			},
			{ status: 405, headers: { Allow: "POST" } },
		);
	}

	const appUrl = (process.env.APP_URL ?? new URL(request.url).origin).replace(
		/\/+$/,
		"",
	);
	const server = createServer(apiFor(headers, ip), appUrl);
	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
		enableJsonResponse: true,
	});
	await server.connect(transport);
	try {
		return await transport.handleRequest(request);
	} finally {
		await server.close();
	}
}

function errorText(error: unknown) {
	if (!(error instanceof ORPCError)) {
		logger.error("MCP tool call failed", error);
		return "Something went wrong";
	}
	const issues: { message: string }[] = error.data?.issues ?? [];
	return [error.message, ...issues.map((issue) => issue.message)].join(": ");
}

async function respond(work: () => Promise<unknown>): Promise<CallToolResult> {
	try {
		return { content: [{ type: "text", text: JSON.stringify(await work()) }] };
	} catch (error) {
		return {
			content: [{ type: "text", text: errorText(error) }],
			isError: true,
		};
	}
}

const invalid = (message: string) => new ORPCError("BAD_REQUEST", { message });

const same = (a: string, b: string) =>
	a.trim().toLowerCase() === b.trim().toLowerCase();

function stateNamed(states: State[], name: string, project: string) {
	const state = states.find((candidate) => same(candidate.name, name));
	if (state) return state;
	throw invalid(
		`No state "${name}" in ${project}. Valid states: ${states.map((s) => s.name).join(", ")}`,
	);
}

function memberNamed(members: Member[], name: string, project: string) {
	const matches = members.filter((member) =>
		[member.displayName, member.fullName, member.email].some(
			(value) => value !== undefined && same(value, name),
		),
	);
	if (matches.length === 1) return matches[0] as Member;
	const options = members.map((member) => member.displayName).join(", ");
	throw invalid(
		matches.length === 0
			? `No member "${name}" in ${project}. Members: ${options}`
			: `More than one member matches "${name}". Use their email instead.`,
	);
}

const date = (timestamp: number) => new Date(timestamp).toISOString();

const Key = z
	.string()
	.describe('A work item\'s key, its project key and number, like "ABC-12"');
const ProjectKey = z.string().describe('A project\'s key, like "ABC"');
const StateName = z
	.string()
	.describe('A state (board column) name, like "In Progress"');
const AssigneeName = z
	.string()
	.describe("A project member's display name, full name or email");
const Markdown = z.string().describe("Markdown");

function createServer(api: Api, appUrl: string) {
	const server = new McpServer({ name: "smelp", version });
	const itemUrl = (workspaceId: string, key: string) =>
		`${appUrl}/${workspaceId}/browse/${key}`;

	async function projectContext(projectKey: string) {
		const [project, states, members] = await Promise.all([
			api.project.find({ projectId: projectKey }),
			api.states.find({ projectId: projectKey }),
			api.projectMembers.find({ projectId: projectKey }),
		]);
		return { project, states, members };
	}

	async function workItem(key: string) {
		const issue = await api.issue.find({ issueId: key });
		const [{ states, members }, comments, relations] = await Promise.all([
			projectContext(issue.projectId),
			api.comments.find({ issueId: key }),
			api.issueRelations.find({ issueId: key }),
		]);
		const nameOf = (userId: string | null) =>
			userId === null
				? null
				: (members.find((member) => member.userId === userId)?.displayName ??
					"a former member");
		return {
			key: issue.id,
			title: issue.title,
			state: states.find((state) => state.id === issue.state)?.name ?? null,
			assignee: nameOf(issue.assignee),
			project: issue.projectId,
			parent: issue.parentId,
			url: itemUrl(issue.workspaceId, issue.id),
			createdBy: issue.createdByName,
			createdAt: date(issue.createdAt),
			updatedAt: date(issue.updatedAt),
			description: issue.description,
			relations: relations.map((relation) => ({
				kind: relation.kind,
				key: relation.issue.id,
				title: relation.issue.title,
				state: relation.issue.stateName,
			})),
			comments: comments.map((comment) => ({
				author: comment.authorName,
				createdAt: date(comment.createdAt),
				body: comment.body,
			})),
		};
	}

	async function workspaceIds() {
		return (await api.workspaces.find()).map((workspace) => workspace.id);
	}

	server.registerTool(
		"whoami",
		{
			annotations: { readOnlyHint: true },
			description:
				"Who you act as in smelp. Everything you do appears under this person's name.",
		},
		() =>
			respond(async () => {
				const { user } = await api.auth.me();
				return {
					name: user.displayName,
					fullName: user.fullName,
					email: user.email,
				};
			}),
	);

	server.registerTool(
		"list_workspaces",
		{
			description: "The workspaces you belong to.",
			annotations: { readOnlyHint: true },
		},
		() =>
			respond(async () =>
				(await api.workspaces.find()).map((workspace) => ({
					id: workspace.id,
					name: workspace.name,
				})),
			),
	);

	server.registerTool(
		"list_projects",
		{
			annotations: { readOnlyHint: true },
			description:
				"Projects you can see. Their keys prefix work item keys. Archived projects are read-only.",
			inputSchema: {
				workspace: z
					.string()
					.optional()
					.describe("A workspace id. Leave out for all your workspaces."),
			},
		},
		({ workspace }) =>
			respond(async () => {
				const ids = workspace ? [workspace] : await workspaceIds();
				const lists = await Promise.all(
					ids.map((workspaceId) => api.projects.find({ workspaceId })),
				);
				return lists.flat().map((project) => ({
					key: project.id,
					name: project.name,
					description: project.description,
					workspace: project.workspaceId,
					archived: project.isArchived,
					member: project.isMember,
				}));
			}),
	);

	server.registerTool(
		"list_states",
		{
			annotations: { readOnlyHint: true },
			description:
				"A project's states, the columns of its board, in board order. The group says what a state means: backlog, unstarted, started, completed or cancelled.",
			inputSchema: { project: ProjectKey },
		},
		({ project }) =>
			respond(async () =>
				(await api.states.find({ projectId: project })).map((state) => ({
					name: state.name,
					group: state.group,
					default: Boolean(state.isDefault),
				})),
			),
	);

	server.registerTool(
		"search_work_items",
		{
			annotations: { readOnlyHint: true },
			description:
				"Find work items whose title contains the text, or whose key is exactly it. Newest changes first, at most 50.",
			inputSchema: {
				query: z.string().min(2).max(200),
				project: ProjectKey.optional().describe(
					"Only search this project, by key",
				),
			},
		},
		({ query, project }) =>
			respond(async () => {
				const ids = project
					? [(await api.project.find({ projectId: project })).workspaceId]
					: await workspaceIds();
				const results = await Promise.all(
					ids.map((workspaceId) => api.issues.search({ workspaceId, query })),
				);
				return results
					.flat()
					.filter((item) => !project || item.projectId === project)
					.sort((a, b) => b.updatedAt - a.updatedAt)
					.slice(0, 50)
					.map((item) => ({
						key: item.id,
						title: item.title,
						state: item.stateName,
						assignee: item.assigneeName,
						project: item.projectId,
					}));
			}),
	);

	server.registerTool(
		"list_my_work_items",
		{
			annotations: { readOnlyHint: true },
			description:
				"Work items assigned to you that aren't completed or cancelled, outside archived projects.",
		},
		() =>
			respond(async () => {
				const ids = await workspaceIds();
				const lists = await Promise.all(
					ids.map((workspaceId) => api.issues.findMine({ workspaceId })),
				);
				return lists
					.flat()
					.sort((a, b) => b.updatedAt - a.updatedAt)
					.map((item) => ({
						key: item.id,
						title: item.title,
						state: item.stateName,
						project: item.projectId,
						url: itemUrl(item.workspaceId, item.id),
					}));
			}),
	);

	server.registerTool(
		"get_work_item",
		{
			annotations: { readOnlyHint: true },
			description:
				"A work item with its Markdown description, related items and plain-text comments, oldest comment first.",
			inputSchema: { key: Key },
		},
		({ key }) => respond(() => workItem(key)),
	);

	server.registerTool(
		"create_work_item",
		{
			description:
				"Create a work item in a project. It starts in the project's default state unless you name one.",
			inputSchema: {
				project: ProjectKey,
				title: z.string(),
				description: Markdown.optional(),
				state: StateName.optional(),
				assignee: AssigneeName.optional(),
			},
		},
		({ project: projectKey, title, description, state, assignee }) =>
			respond(async () => {
				const { project, states, members } = await projectContext(projectKey);
				const initial = state
					? stateNamed(states, state, project.id)
					: (states.find((candidate) => candidate.isDefault) ?? states[0]);
				if (!initial) throw invalid(`${project.id} has no states`);
				const created = await api.issue.create({
					projectId: project.id,
					workspaceId: project.workspaceId,
					title,
					description: description ?? "",
					state: initial.id,
					type: "task",
					assignee: assignee
						? memberNamed(members, assignee, project.id).userId
						: undefined,
				});
				return workItem(created.id);
			}),
	);

	server.registerTool(
		"update_work_item",
		{
			description:
				"Change a work item. Only the fields you pass change. A description replaces the whole old one.",
			inputSchema: {
				key: Key,
				title: z.string().optional(),
				description: Markdown.optional(),
				state: StateName.optional(),
				assignee: AssigneeName.nullable()
					.optional()
					.describe(
						"A project member's display name, full name or email, or null to unassign",
					),
			},
		},
		({ key, title, description, state, assignee }) =>
			respond(async () => {
				const issue = await api.issue.find({ issueId: key });
				const { states, members } = await projectContext(issue.projectId);
				await api.issue.update({
					id: issue.id,
					title,
					description,
					state:
						state === undefined
							? undefined
							: stateNamed(states, state, issue.projectId).id,
					assignee:
						assignee === undefined || assignee === null
							? assignee
							: memberNamed(members, assignee, issue.projectId).userId,
				});
				return workItem(issue.id);
			}),
	);

	server.registerTool(
		"add_comment",
		{
			description:
				"Comment on a work item. Comments are plain text: the web app shows them as written, without rendering Markdown.",
			inputSchema: { key: Key, body: z.string() },
		},
		({ key, body }) =>
			respond(async () => {
				const comment = await api.comments.create({ issueId: key, body });
				return { key, createdAt: date(comment.createdAt), body: comment.body };
			}),
	);

	return server;
}
