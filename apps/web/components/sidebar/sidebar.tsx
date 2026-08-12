import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
} from "#/components/ui/sidebar";

export function AppSidebar() {
	return (
		<Sidebar
			variant={"inset"}
			className="top-(--header-height) h-[calc(100svh-var(--header-height))]!"
		>
			<SidebarHeader></SidebarHeader>
			<SidebarContent></SidebarContent>
			<SidebarFooter></SidebarFooter>
		</Sidebar>
	);
}
