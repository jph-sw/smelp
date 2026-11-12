import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { ErrorPage } from "#/components/error-page";
import { SiteHeader } from "#/components/sidebar/header";
import { AppSidebar } from "#/components/sidebar/sidebar";
import { SidebarInset, SidebarProvider } from "#/components/ui/sidebar";
import { VerifyEmailBanner } from "#/components/verify-email-banner";
import { projectsQueryOptions } from "#/lib/data/project";
import {
	workspaceQueryOptions,
	workspacesQueryOptions,
} from "#/lib/data/workspace";
import { workspaceMembersQueryOptions } from "#/lib/data/workspace-members";

export const Route = createFileRoute("/(workspace)/$id")({
	component: RouteComponent,
	loader: async ({ context: { queryClient, user }, params: { id } }) => {
		if (user == null) throw redirect({ to: "/signin" });

		await Promise.all([
			queryClient.ensureQueryData(workspacesQueryOptions({ userId: user.id })),
			queryClient.ensureQueryData(workspaceQueryOptions({ workspaceId: id })),
			queryClient.ensureQueryData(projectsQueryOptions({ workspaceId: id })),
			queryClient.ensureQueryData(
				workspaceMembersQueryOptions({ workspaceId: id }),
			),
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

	const { data: projects } = useSuspenseQuery(
		projectsQueryOptions({ workspaceId }),
	);

	if (user === null) {
		throw navigate({ to: "/signin" });
	}

	return (
		<div className="h-dvh [--header-height:calc(--spacing(10))]">
			<SidebarProvider className="flex h-full min-h-0 flex-col">
				<VerifyEmailBanner user={user} />
				<SiteHeader workspace={workspace} workspaces={workspaces} user={user} />
				<div className="flex flex-1 min-h-0">
					<AppSidebar workspace={workspace} projects={projects} />
					<SidebarInset className="min-h-0 min-w-0">
						<div className="flex flex-1 min-h-0 flex-col">
							<div className="flex-1 min-h-0 overflow-y-auto rounded-xl bg-muted/50">
								<Outlet />
							</div>
						</div>
					</SidebarInset>
				</div>
			</SidebarProvider>
		</div>
	);
}
