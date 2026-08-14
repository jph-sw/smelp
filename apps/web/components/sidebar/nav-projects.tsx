import {
	ChevronUpIcon,
	PlusSignIcon,
	SmileIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "#/components/ui/sidebar";
import { Button } from "../ui/button";
import { Collapsible, CollapsibleContent } from "../ui/collapsible";

export function NavProjects() {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<Collapsible open={isOpen} defaultOpen className="group/collapsible">
			<SidebarGroup>
				<SidebarGroupLabel>
					Projects
					<div className="flex items-center ml-auto">
						<Button
							className={"hidden group-hover/collapsible:flex"}
							variant={"ghost"}
							size={"icon-xs"}
						>
							<HugeiconsIcon icon={PlusSignIcon} />
						</Button>
						<Button
							variant={"ghost"}
							size={"icon-xs"}
							onClick={() => setIsOpen(!isOpen)}
						>
							<HugeiconsIcon
								icon={ChevronUpIcon}
								className="transition-transform group-data-open/collapsible:rotate-180"
							/>
						</Button>
					</div>
				</SidebarGroupLabel>{" "}
				{/*<SidebarGroupAction>
					<HugeiconsIcon icon={PlusSignIcon} />
				</SidebarGroupAction>*/}
				<CollapsibleContent>
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
				</CollapsibleContent>
			</SidebarGroup>
		</Collapsible>
	);
}
