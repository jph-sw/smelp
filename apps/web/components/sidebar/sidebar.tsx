import { HomeIcon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { tables } from "@smelp/db";
import { Link } from "@tanstack/react-router";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarHeader,
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
	projects: tables["project"][];
}) {
	return (
		<Sidebar
			variant={"inset"}
			className="top-(--header-height) h-[calc(100svh-var(--header-height))]!"
		>
			<SidebarHeader>
				<span>Projects</span>
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupContent>
						<SidebarMenu>
							<SidebarMenuItem>
								<SidebarMenuButton
									onClick={() =>
										openCreateIssueDialog({
											workspaceId: workspace.id,
											projectId: projects[0].id,
										})
									}
									className={cn(
										buttonVariants({ variant: "outline", size: "lg" }),
										"mb-2",
									)}
									// className="mb-2 bg-primary text-primary-foreground duration-200 ease-linear hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
								>
									<HugeiconsIcon icon={PlusSignIcon} />
									New work item
								</SidebarMenuButton>
							</SidebarMenuItem>
							<SidebarMenuItem>
								<SidebarMenuButton
									render={<Link to="/$id" params={{ id: workspace.id }} />}
								>
									<HugeiconsIcon icon={HomeIcon} />
									Home
								</SidebarMenuButton>
							</SidebarMenuItem>
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
				<NavWorkspaces workspace={workspace} />
				<NavProjects workspace={workspace} projects={projects} />
			</SidebarContent>
			<SidebarFooter></SidebarFooter>
		</Sidebar>
	);
}
