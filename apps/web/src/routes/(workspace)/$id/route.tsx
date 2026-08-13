import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SiteHeader } from "#/components/sidebar/header";
import { AppSidebar } from "#/components/sidebar/sidebar";
import { SidebarInset, SidebarProvider } from "#/components/ui/sidebar";
import { workspaceQueryOptions } from "#/lib/data/workspace";
import { ApiError } from "#/lib/utils";

export const Route = createFileRoute("/(workspace)/$id")({
	component: RouteComponent,
	loader: ({ context: { queryClient }, params: { id } }) => {
		return queryClient.ensureQueryData(
			workspaceQueryOptions({ workspaceId: id }),
		);
	},
	errorComponent: ({ error }) => {
		if (error instanceof ApiError && error.status === 404) {
			return <div>Workspace not found.</div>;
		}
		return <div>Something went wrong loading this workspace.</div>;
	},
});

function RouteComponent() {
	const navigate = Route.useNavigate();
	const { id: workspaceId } = Route.useParams();
	const { user } = Route.useRouteContext();

	const { data: workspace } = useSuspenseQuery(
		workspaceQueryOptions({ workspaceId }),
	);

	if (user === null) {
		throw navigate({ to: "/signin" });
	}

	return (
		<div className="[--header-height:calc(--spacing(10))]">
			<SidebarProvider className="flex flex-col">
				<SiteHeader workspace={workspace} user={user} />
				<div className="flex flex-1">
					<AppSidebar />
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
