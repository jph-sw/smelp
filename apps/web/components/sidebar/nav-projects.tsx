import {
	ChevronUpIcon,
	MoreHorizontal,
	Setting07Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { tables } from "@smelp/db";
import { Link, useMatchRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuAction,
	SidebarMenuButton,
	SidebarMenuItem,
} from "#/components/ui/sidebar";
import { useWorkspaceAccess } from "#/lib/workspace-viewer";
import { DynamicIcon } from "../dynamic-icon";
import { CreateProjectDialog } from "../project/create-project-dialog";
import { Button } from "../ui/button";
import { Collapsible, CollapsibleContent } from "../ui/collapsible";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "../ui/dropdown-menu";

export function NavProjects({
	workspace,
	projects,
}: {
	workspace: tables["workspace"];
	projects: tables["project"][];
}) {
	const [isOpen, setIsOpen] = useState(true);
	const matchRoute = useMatchRoute();
	const { viewer, canWrite } = useWorkspaceAccess();

	return (
		<Collapsible open={isOpen} defaultOpen className="group/collapsible">
			<SidebarGroup>
				<SidebarGroupLabel>
					Projects
					<div className="flex items-center ml-auto">
						{canWrite && <CreateProjectDialog workspace={workspace} />}
						<Button
							variant={"ghost"}
							size={"icon-sm"}
							className="aria-expanded:bg-transparent"
							aria-expanded={isOpen}
							aria-label={isOpen ? "Collapse projects" : "Expand projects"}
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
										isActive={
											!!matchRoute({
												to: "/$id/projects/$projectId",
												params: { id: workspace.id, projectId: project.id },
												fuzzy: true,
											})
										}
										render={
											<Link
												to="/$id/projects/$projectId"
												params={{ id: workspace.id, projectId: project.id }}
											/>
										}
									>
										<DynamicIcon name={project.icon} />
										<span className="truncate" title={project.name}>
											{project.name}
										</span>
									</SidebarMenuButton>
									{viewer.mode !== "public" && (
										<DropdownMenu>
											<DropdownMenuTrigger
												render={<SidebarMenuAction showOnHover />}
											>
												<HugeiconsIcon icon={MoreHorizontal} />
												<span className="sr-only">More</span>
											</DropdownMenuTrigger>
											<DropdownMenuContent>
												<DropdownMenuItem
													render={
														<Link
															to="/$id/settings/projects/$projectId"
															params={{
																id: workspace.id,
																projectId: project.id,
															}}
														/>
													}
												>
													<HugeiconsIcon icon={Setting07Icon} /> Settings
												</DropdownMenuItem>
											</DropdownMenuContent>
										</DropdownMenu>
									)}
								</SidebarMenuItem>
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</CollapsibleContent>
			</SidebarGroup>
		</Collapsible>
	);
}
