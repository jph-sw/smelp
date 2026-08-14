import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import type { AppRouter } from "@smelp/api";

const link = new RPCLink({
	url: "http://127.0.0.1:3000/rpc",
	headers: { Authorization: "Bearer token" },
});

export const orpc: RouterClient<AppRouter> = createORPCClient(link);
