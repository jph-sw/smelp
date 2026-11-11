import { HomeIcon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { tables } from "@smelp/db";
import { Link, useMatchRoute, useParams } from "@tanstack/react-router";
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "#/components/ui/sidebar";
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
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
				<NavWorkspaces workspace={workspace} />
				<NavProjects workspace={workspace} projects={myProjects} />
			</SidebarContent>
		</Sidebar>
	);
}
