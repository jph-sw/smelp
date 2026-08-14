import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { ErrorPage } from "#/components/error-page";
import { Toaster } from "#/components/ui/toast";
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
	errorComponent: ErrorPage,
	component: () => (
		<>
			<Toaster />
			<Outlet />
		</>
	),
});
