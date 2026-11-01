import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import type { AppRouter } from "@smelp/api";

const link = new RPCLink({
	url: `${window.location.origin}/rpc`,
	headers: { Authorization: "Bearer token" },
	fetch: (request, init) =>
		globalThis.fetch(request, { ...init, credentials: "include" }),
});

export const orpc: RouterClient<AppRouter> = createORPCClient(link);
