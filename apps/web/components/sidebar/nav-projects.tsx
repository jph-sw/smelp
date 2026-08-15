import { ChevronUpIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { tables } from "@smelp/db";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "#/components/ui/sidebar";
import { DynamicIcon } from "../dynamic-icon";
import { CreateProjectDialog } from "../project/create-project-dialog";
import { Button } from "../ui/button";
import { Collapsible, CollapsibleContent } from "../ui/collapsible";

export function NavProjects({
	workspace,
	projects,
}: {
	workspace: tables["workspace"];
	projects: tables["project"][];
}) {
	const [isOpen, setIsOpen] = useState(true);

	return (
		<Collapsible open={isOpen} defaultOpen className="group/collapsible">
			<SidebarGroup>
				<SidebarGroupLabel>
					Projects
					<div className="flex items-center ml-auto">
						<CreateProjectDialog workspace={workspace} />
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
				</SidebarGroupLabel>
				<CollapsibleContent>
					<SidebarGroupContent>
						<SidebarMenu>
							{projects.map((project) => (
								<SidebarMenuItem key={project.id}>
									<SidebarMenuButton
										render={
											<Link
												to="/$id/projects/$projectId"
												params={{ id: workspace.id, projectId: project.id }}
											/>
										}
									>
										<DynamicIcon name={project.icon} />
										{project.name}
									</SidebarMenuButton>
								</SidebarMenuItem>
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</CollapsibleContent>
			</SidebarGroup>
		</Collapsible>
	);
}
