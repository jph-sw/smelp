import { type Context, onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { CORSPlugin } from "@orpc/server/plugins";
import type { FriendlyStandardHandleOptions } from "@orpc/server/standard";
import { Auth } from "@smelp/auth";
import { Utils } from "@smelp/db";
import { Migrator } from "@smelp/migrate";
import { MeHandler } from "./routes/auth/me";
import { SignInHandler } from "./routes/auth/signin";
import { SignUpHandler } from "./routes/auth/signup";
import { findWorkspace, PostWorkspacesHandler } from "./routes/workspace";
import { findWorkspaces } from "./routes/workspaces";

const migrator = new Migrator();
const auth = new Auth();
const utils = new Utils();

await migrator.up();

await auth.createAuthSession("test_user");

function bunRequestHandler<T extends Context>(
	handler: RPCHandler<T>,
	options?:
		| FriendlyStandardHandleOptions<T>
		| ((request: Request) => FriendlyStandardHandleOptions<T>),
): (request: Request) => Promise<Response> {
	return async (request: Request) => {
		const resolvedOptions =
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
	workspace: {
		find: findWorkspace,
	},
	workspaces: {
		find: findWorkspaces,
	},
};

export type AppRouter = typeof router;

const handler = new RPCHandler(router, {
	plugins: [new CORSPlugin()],
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
		"/api/auth/signin": {
			POST: SignInHandler,
		},
		"/api/auth/signup": {
			POST: SignUpHandler,
		},
		"/api/auth/me": {
			GET: MeHandler,
		},
		"/api/workspaces": {
			POST: PostWorkspacesHandler,
		},
	},
});

utils.logger.info(`𖹭 Server running at ${server.url}`);
