import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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
import { NavProjects } from "./nav-projects";
import { NavWorkspaces } from "./nav-workspaces";

export function AppSidebar() {
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
								<SidebarMenuButton className="bg-secondary text-secondary-foreground duration-200 ease-linear hover:bg-secondary/90 hover:text-secondary-foreground active:bg-secondary/90 active:text-secondary-foreground">
									<HugeiconsIcon icon={PlusSignIcon} />
									New work item
								</SidebarMenuButton>
							</SidebarMenuItem>
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
				<NavWorkspaces />
				<NavProjects />
			</SidebarContent>
			<SidebarFooter></SidebarFooter>
		</Sidebar>
	);
}
