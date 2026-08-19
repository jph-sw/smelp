import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { RoutePending } from "#/components/route-pending";
import { routeTree } from "./routeTree.gen";

export const queryClient = new QueryClient();

export const router = createRouter({
	routeTree,
	context: { queryClient, user: null },
	defaultPreload: "intent",
	defaultPendingComponent: RoutePending,
	defaultPendingMs: 300,
	defaultPendingMinMs: 200,
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}
