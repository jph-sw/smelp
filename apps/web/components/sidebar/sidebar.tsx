import {
	HomeIcon,
	Notification01Icon,
	PlusSignIcon,
	Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { tables } from "@smelp/db";
import { useQuery } from "@tanstack/react-query";
import { Link, useMatchRoute, useParams } from "@tanstack/react-router";
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarMenu,
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
} from "#/components/ui/sidebar";
import { unreadCountQueryOptions } from "#/lib/data/notifications";
import { cn } from "#/lib/utils";
import { openCreateIssueDialog } from "../issue/create-issue-dialog-store";
import { buttonVariants } from "../ui/button";
import { NavProjects } from "./nav-projects";
import { NavWorkspaces } from "./nav-workspaces";

export function AppSidebar({
	workspace,
	projects,
}: {
	workspace: tables["workspace"];
	projects: (tables["project"] & { isMember: boolean; isArchived: boolean })[];
}) {
	const matchRoute = useMatchRoute();
	const { data: unread } = useQuery(
		unreadCountQueryOptions({ workspaceId: workspace.id }),
	);
	const unreadCount = unread?.count ?? 0;
	const params = useParams({ strict: false });

	// New work items go into the project on screen. Issue ids are "<projectId>-<n>".
	const currentProjectId =
		params.projectId ?? params.issueId?.replace(/-\d+$/, "");
	// Archived projects are read-only, so they leave the sidebar and can't take new work items.
	const myProjects = projects.filter(
		(project) => project.isMember && !project.isArchived,
	);
	const isOnArchivedProject = projects.some(
		(project) => project.id === currentProjectId && project.isArchived,
	);
	const targetProject = isOnArchivedProject
		? undefined
		: (myProjects.find((project) => project.id === currentProjectId) ??
			myProjects[0]);

	return (
		<Sidebar
			variant={"inset"}
			className="top-(--header-height) h-[calc(100svh-var(--header-height))]!"
		>
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupContent>
						<SidebarMenu>
							<SidebarMenuItem>
								<SidebarMenuButton
									disabled={!targetProject}
									onClick={() =>
										targetProject &&
										openCreateIssueDialog({
											workspaceId: workspace.id,
											projectId: targetProject.id,
											projectName: targetProject.name,
										})
									}
									className={cn(
										buttonVariants({ variant: "outline", size: "lg" }),
										"mb-2",
									)}
								>
									<HugeiconsIcon icon={PlusSignIcon} />
									New work item
								</SidebarMenuButton>
							</SidebarMenuItem>
							<SidebarMenuItem>
								<SidebarMenuButton
									render={<Link to="/$id" params={{ id: workspace.id }} />}
									isActive={
										!!matchRoute({
											to: "/$id",
											params: { id: workspace.id },
											fuzzy: false,
										})
									}
								>
									<HugeiconsIcon icon={HomeIcon} />
									Home
								</SidebarMenuButton>
							</SidebarMenuItem>
							<SidebarMenuItem>
								<SidebarMenuButton
									render={
										<Link to="/$id/inbox" params={{ id: workspace.id }} />
									}
									isActive={
										!!matchRoute({
											to: "/$id/inbox",
											params: { id: workspace.id },
										})
									}
								>
									<HugeiconsIcon icon={Notification01Icon} />
									Inbox
								</SidebarMenuButton>
								{unreadCount > 0 && (
									<SidebarMenuBadge aria-label={`${unreadCount} unread`}>
										{unreadCount > 99 ? "99+" : unreadCount}
									</SidebarMenuBadge>
								)}
							</SidebarMenuItem>
							<SidebarMenuItem>
								<SidebarMenuButton
									render={
										<Link to="/$id/search" params={{ id: workspace.id }} />
									}
									isActive={
										!!matchRoute({
											to: "/$id/search",
											params: { id: workspace.id },
										})
									}
								>
									<HugeiconsIcon icon={Search01Icon} />
									Search
								</SidebarMenuButton>
							</SidebarMenuItem>
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
				<NavWorkspaces workspace={workspace} />
				<NavProjects workspace={workspace} projects={myProjects} />
			</SidebarContent>
		</Sidebar>
	);
}
