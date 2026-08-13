import {
	Briefcase,
	EllipsisIcon,
	PlusSignIcon,
	SmileIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "#/components/ui/sidebar";

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
				<SidebarGroup>
					<SidebarGroupLabel>Workspace</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							<SidebarMenuItem>
								<SidebarMenuButton>
									<HugeiconsIcon icon={Briefcase} />
									Projects
								</SidebarMenuButton>
							</SidebarMenuItem>
							<SidebarMenuItem>
								<SidebarMenuButton>
									<HugeiconsIcon icon={EllipsisIcon} />
									More
								</SidebarMenuButton>
							</SidebarMenuItem>
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
				<SidebarGroup>
					<SidebarGroupLabel>Projects</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							<SidebarMenuItem>
								<SidebarMenuButton>
									<HugeiconsIcon icon={SmileIcon} />
									Projects 1
								</SidebarMenuButton>
							</SidebarMenuItem>
							<SidebarMenuItem>
								<SidebarMenuButton>
									<HugeiconsIcon icon={SmileIcon} />
									Projects 2
								</SidebarMenuButton>
							</SidebarMenuItem>
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>
			<SidebarFooter></SidebarFooter>
		</Sidebar>
	);
}
