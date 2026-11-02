import type { Context } from "@orpc/server";
import type { RPCHandler } from "@orpc/server/fetch";
import type { FriendlyStandardHandleOptions } from "@orpc/server/standard";
import { Utils } from "@smelp/db";
import { Migrator } from "@smelp/migrate";

import { avatarResponse } from "./lib/avatars";
import { logMailStatus } from "./lib/mail";
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

const server = Bun.serve({
	routes: {
		"/rpc": rpcRouteHandler,
		"/rpc/*": rpcRouteHandler,
		"/api/status": new Response("OK"),
		"/api/avatars/:userId": (request) =>
			avatarResponse(request.headers, request.params.userId),
	},
});

utils.logger.info(`𖹭 Server running at ${server.url}`);
