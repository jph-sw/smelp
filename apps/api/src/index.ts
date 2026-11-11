import path from "node:path";
import type { Context } from "@orpc/server";
import type { RPCHandler } from "@orpc/server/fetch";
import type { FriendlyStandardHandleOptions } from "@orpc/server/standard";
import { databasePath, Utils } from "@smelp/db";
import { Migrator } from "@smelp/migrate";

import { avatarResponse } from "./lib/avatars";
import { markServerRunning } from "./lib/backup";
import { statusResponse } from "./lib/health";
import { logMailStatus } from "./lib/mail";
import { version } from "./lib/version";
import { createWebAppHandler } from "./lib/web-app";
import { handler } from "./router";

const migrator = new Migrator();
const utils = new Utils();

await migrator.up();
logMailStatus();

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

export type { AppRouter } from "./router";

// Only trust X-Forwarded-For behind a proxy that sets it; otherwise anyone can
// spoof it. A trusted proxy appends the address it saw, so the last entry is real.
function clientIp(request: Request): string {
	if (process.env.TRUST_PROXY === "true") {
		const forwarded = request.headers.get("x-forwarded-for")?.split(",").at(-1);
		if (forwarded) return forwarded.trim();
	}
	return server.requestIP(request)?.address ?? "unknown";
}

const rpcRouteHandler = bunRequestHandler(handler, (request) => ({
	prefix: "/rpc",
	context: {
		headers: request.headers,
		ip: clientIp(request),
	},
}));

// In development the web app comes from Vite instead, on its own port.
const webApp = await createWebAppHandler(
	process.env.WEB_DIST ?? path.resolve(import.meta.dir, "../../web/dist"),
);
if (!webApp && process.env.NODE_ENV === "production") {
	utils.logger.warn("The web app isn't built, so only the API is being served");
}

const server = Bun.serve({
	fetch: webApp ?? (() => new Response("Not found", { status: 404 })),
	// For failures outside the API's own handling, like avatars and static files.
	error(error) {
		utils.logger.error("Request failed", error);
		return new Response("Something went wrong", { status: 500 });
	},
	routes: {
		"/rpc": rpcRouteHandler,
		"/rpc/*": rpcRouteHandler,
		"/api/status": () => statusResponse(),
		"/api/avatars/:userId": (request) =>
			avatarResponse(request.headers, request.params.userId),
	},
});

utils.logger.info(`𖹭 smelp ${version} running at ${server.url}`);

const clearRunningMarker = markServerRunning(databasePath());

// Finishes requests in progress. As the first process in a container, nothing else
// would handle these, and Docker would wait and then force it to stop.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
	process.on(signal, () => {
		clearRunningMarker();
		server.stop().finally(() => process.exit(0));
	});
}
