import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { type AuthUser, currentUserQueryOptions } from "../../lib/auth";

export const Route = createRootRouteWithContext<{
	queryClient: QueryClient;
	user: AuthUser | null;
}>()({
	beforeLoad: async ({ context }) => {
		const user = await context.queryClient.ensureQueryData(
			currentUserQueryOptions,
		);
		return { user };
	},
	component: () => <Outlet />,
});
