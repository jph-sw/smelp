import { type Context, onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { CORSPlugin, ResponseHeadersPlugin } from "@orpc/server/plugins";
import type { FriendlyStandardHandleOptions } from "@orpc/server/standard";
import { Auth } from "@smelp/auth";
import { Utils } from "@smelp/db";
import { Migrator } from "@smelp/migrate";
import { me } from "./routes/auth/me";
import { signIn } from "./routes/auth/signin";
import { signOut } from "./routes/auth/signout";
import { signUp } from "./routes/auth/signup";
import { createIssue, findIssue, updateIssue } from "./routes/issue";
import { findIssues } from "./routes/issues";
import {
	createProject,
	deleteProject,
	findProject,
	joinProject,
} from "./routes/project";
import { findProjectMembers } from "./routes/project-members";
import { findProjects } from "./routes/projects";
import { findStates } from "./routes/states";
import {
	createWorkspace,
	deleteWorkspace,
	findWorkspace,
	updateWorkspace,
} from "./routes/workspace";
import {
	acceptInvite,
	cancelInvite,
	createInvite,
	findInvites,
	findMyInvites,
} from "./routes/workspace-invites";
import { findWorkspaceMembers } from "./routes/workspace-members";
import { findWorkspaces } from "./routes/workspaces";

const migrator = new Migrator();
const auth = new Auth();
const utils = new Utils();

await migrator.up();

function bunRequestHandler<T extends Context>(
	handler: RPCHandler<T>,
	options?:
		| FriendlyStandardHandleOptions<T>
		| ((request: Request) => FriendlyStandardHandleOptions<T>),
): (request: Request) => Promise<Response> {
	return async (request: Request) => {
		const resolvedOptions =
			// biome-ignore lint/style/noNonNullAssertion: <No other way>
			typeof options === "function" ? options(request) : options!;
		const { matched, response } = await handler.handle(
			request,
			resolvedOptions,
		);

		if (matched) {
			return response;
		}

		return new Response("Not found", { status: 404 });
	};
}

const router = {
	auth: {
		signIn,
		signUp,
		signOut,
		me,
	},
	workspace: {
		find: findWorkspace,
		create: createWorkspace,
		update: updateWorkspace,
		delete: deleteWorkspace,
	},
	workspaceMembers: {
		find: findWorkspaceMembers,
	},
	workspaceInvites: {
		create: createInvite,
		find: findInvites,
		findMine: findMyInvites,
		cancel: cancelInvite,
		accept: acceptInvite,
	},
	workspaces: {
		find: findWorkspaces,
	},
	projects: {
		find: findProjects,
	},
	project: {
		find: findProject,
		create: createProject,
		delete: deleteProject,
		join: joinProject,
	},
	projectMembers: {
		find: findProjectMembers,
	},
	issue: {
		find: findIssue,
		create: createIssue,
		update: updateIssue,
	},
	issues: {
		find: findIssues,
	},
	states: {
		find: findStates,
	},
};

export type AppRouter = typeof router;

const handler = new RPCHandler(router, {
	plugins: [new CORSPlugin({ credentials: true }), new ResponseHeadersPlugin()],
	interceptors: [
		onError((error) => {
			console.error(error);
		}),
	],
});

const rpcRouteHandler = bunRequestHandler(handler, (request) => ({
	prefix: "/rpc",
	context: {
		headers: request.headers,
	},
}));

const server = Bun.serve({
	routes: {
		"/rpc": rpcRouteHandler,
		"/rpc/*": rpcRouteHandler,
		"/api/status": new Response("OK"),
	},
});

utils.logger.info(`𖹭 Server running at ${server.url}`);
