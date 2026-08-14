import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { ErrorPage } from "#/components/error-page";
import { SiteHeader } from "#/components/sidebar/header";
import { AppSidebar } from "#/components/sidebar/sidebar";
import { SidebarInset, SidebarProvider } from "#/components/ui/sidebar";
import {
	workspaceQueryOptions,
	workspacesQueryOptions,
} from "#/lib/data/workspace";

export const Route = createFileRoute("/(workspace)/$id")({
	component: RouteComponent,
	loader: async ({ context: { queryClient, user }, params: { id } }) => {
		if (user == null) throw redirect({ to: "/signin" });

		await Promise.all([
			queryClient.ensureQueryData(workspacesQueryOptions({ userId: user.id })),
			queryClient.ensureQueryData(workspaceQueryOptions({ workspaceId: id })),
		]);
	},
	errorComponent: ErrorPage,
});

function RouteComponent() {
	const navigate = Route.useNavigate();
	const { id: workspaceId } = Route.useParams();
	const { user } = Route.useRouteContext();

	if (user == null) throw navigate({ to: "/signin" });

	const { data: workspace } = useSuspenseQuery(
		workspaceQueryOptions({ workspaceId }),
	);

	const { data: workspaces } = useSuspenseQuery(
		workspacesQueryOptions({ userId: user.id }),
	);

	if (user === null) {
		throw navigate({ to: "/signin" });
	}

	return (
		<div className="[--header-height:calc(--spacing(10))]">
			<SidebarProvider className="flex flex-col">
				<SiteHeader workspace={workspace} workspaces={workspaces} user={user} />
				<div className="flex flex-1">
					<AppSidebar workspace={workspace} />
					<SidebarInset>
						<div className="flex flex-1 flex-col">
							<div className="min-h-screen flex-1 rounded-xl bg-muted/50 md:min-h-min p-2">
								<Outlet />
							</div>
						</div>
					</SidebarInset>
				</div>
			</SidebarProvider>
		</div>
	);
}
