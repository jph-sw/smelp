import { Activity01Icon, Briefcase } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { tables } from "@smelp/db";
import { Link, useMatchRoute } from "@tanstack/react-router";
import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "#/components/ui/sidebar";

export function NavWorkspaces({
	workspace,
}: {
	workspace: tables["workspace"];
}) {
	const matchRoute = useMatchRoute();
	const isProjectsActive = !!matchRoute({
		to: "/$id/projects",
		params: { id: workspace.id },
	});
	const isActivityActive = !!matchRoute({
		to: "/$id/activity",
		params: { id: workspace.id },
	});

	return (
		<SidebarGroup>
			<SidebarGroupLabel>Workspace</SidebarGroupLabel>
			<SidebarGroupContent>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							isActive={isProjectsActive}
							render={<Link to="/$id/projects" params={{ id: workspace.id }} />}
						>
							<HugeiconsIcon icon={Briefcase} />
							Projects
						</SidebarMenuButton>
					</SidebarMenuItem>
					<SidebarMenuItem>
						<SidebarMenuButton
							isActive={isActivityActive}
							render={<Link to="/$id/activity" params={{ id: workspace.id }} />}
						>
							<HugeiconsIcon icon={Activity01Icon} />
							Activity
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarGroupContent>
		</SidebarGroup>
	);
}
