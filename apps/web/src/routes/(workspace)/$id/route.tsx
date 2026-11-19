import { ORPCError } from "@orpc/client";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { ErrorPage } from "#/components/error-page";
import { SiteHeader } from "#/components/sidebar/header";
import { KeyboardShortcutsDialog } from "#/components/sidebar/keyboard-shortcuts-dialog";
import { AppSidebar } from "#/components/sidebar/sidebar";
import { SidebarInset, SidebarProvider } from "#/components/ui/sidebar";
import { VerifyEmailBanner } from "#/components/verify-email-banner";
import { projectsQueryOptions } from "#/lib/data/project";
import {
	workspaceQueryOptions,
	workspacesQueryOptions,
} from "#/lib/data/workspace";
import { workspaceMembersQueryOptions } from "#/lib/data/workspace-members";
import { toWorkspaceViewer } from "#/lib/workspace-viewer";

export const Route = createFileRoute("/(workspace)/$id")({
	component: RouteComponent,
	beforeLoad: async ({
		context: { queryClient, user },
		params: { id },
		location,
	}) => {
		const workspace = await queryClient
			.ensureQueryData(workspaceQueryOptions({ workspaceId: id }))
			.catch((error) => {
				if (error instanceof ORPCError && error.code === "UNAUTHORIZED") {
					throw redirect({
						to: "/signin",
						search: { redirect: location.href },
					});
				}
				throw error;
			});
		const members =
			workspace.viewerAccess === "member"
				? await queryClient.ensureQueryData(
						workspaceMembersQueryOptions({ workspaceId: id }),
					)
				: [];
		return { viewer: toWorkspaceViewer(workspace.viewerAccess, user, members) };
	},
	loader: async ({ context: { queryClient, user }, params: { id } }) => {
		await Promise.all([
			user &&
				queryClient.ensureQueryData(
					workspacesQueryOptions({ userId: user.id }),
				),
			queryClient.ensureQueryData(projectsQueryOptions({ workspaceId: id })),
		]);
	},
	errorComponent: ErrorPage,
});

function RouteComponent() {
	const { id: workspaceId } = Route.useParams();
	const { user } = Route.useRouteContext();

	const { data: workspace } = useSuspenseQuery(
		workspaceQueryOptions({ workspaceId }),
	);
	const { data: projects } = useSuspenseQuery(
		projectsQueryOptions({ workspaceId }),
	);

	return (
		<div className="h-dvh [--header-height:calc(--spacing(10))] pointer-coarse:[--header-height:calc(--spacing(14))]">
			<SidebarProvider className="flex h-full min-h-0 flex-col">
				{user && <VerifyEmailBanner user={user} />}
				<SiteHeader workspace={workspace} />
				<div className="flex flex-1 min-h-0 pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]">
					<AppSidebar workspace={workspace} projects={projects} />
					<SidebarInset className="min-h-0 min-w-0">
						<div className="flex flex-1 min-h-0 flex-col">
							<div className="flex-1 min-h-0 overflow-y-auto rounded-lg border bg-background">
								<Outlet />
							</div>
						</div>
					</SidebarInset>
				</div>
				<KeyboardShortcutsDialog />
			</SidebarProvider>
		</div>
	);
}
