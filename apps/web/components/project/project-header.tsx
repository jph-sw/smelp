import {
	KanbanIcon,
	LeftToRightListBulletIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { projectQueryOptions } from "#/lib/data/project";
import { DynamicIcon } from "../dynamic-icon";
import { Button } from "../ui/button";

export type ProjectView = "board" | "list";

const VIEWS = [
	{ value: "board", label: "Board", icon: KanbanIcon },
	{ value: "list", label: "List", icon: LeftToRightListBulletIcon },
] as const;

// Switches the work items page between board and list, keeping its filters.
function ViewToggle({
	projectId,
	workspaceId,
	view,
}: {
	projectId: string;
	workspaceId: string;
	view: ProjectView;
}) {
	return (
		<div className="ms-auto flex shrink-0 items-center gap-0.5 rounded-md bg-secondary p-0.5">
			{VIEWS.map((option) => (
				<Button
					key={option.value}
					size="sm"
					variant={view === option.value ? "outline" : "ghost"}
					aria-current={view === option.value ? "page" : undefined}
					render={
						<Link
							to="/$id/projects/$projectId"
							params={{ id: workspaceId, projectId }}
							search={(previous) => ({
								...previous,
								view: option.value === "list" ? "list" : undefined,
							})}
							replace
						/>
					}
				>
					<HugeiconsIcon icon={option.icon} />
					{option.label}
				</Button>
			))}
		</div>
	);
}

export function ProjectHeader({
	projectId,
	workspaceId,
	view,
	section = "items",
}: {
	projectId: string;
	workspaceId: string;
	/** Shows the board/list toggle, on the work items page. */
	view?: ProjectView;
	/** Which tab is open: the work items, the cycles or the modules. */
	section?: "items" | "cycles" | "modules";
}) {
	const { data: project } = useSuspenseQuery(
		projectQueryOptions({ projectId }),
	);

	return (
		<div className="flex w-full shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b px-4 py-1.5 sm:h-12 sm:flex-nowrap sm:overflow-x-auto sm:py-0">
			<Link
				className="group flex min-w-0 items-center gap-2"
				to="/$id/projects/$projectId"
				params={{ projectId: project.id, id: workspaceId }}
			>
				<div className="flex shrink-0 items-center justify-center rounded-sm bg-secondary p-1.5">
					<DynamicIcon name={project.icon} className="size-4" />
				</div>
				<h3 className="max-w-48 truncate font-medium group-hover:underline sm:max-w-none sm:whitespace-nowrap">
					{project.name}
				</h3>
			</Link>
			<div className="order-last -m-1 flex w-[calc(100%+0.5rem)] items-center gap-2 overflow-x-auto p-1 sm:order-none sm:my-0 sm:me-0 sm:p-0 sm:ms-4 sm:w-auto sm:shrink-0 sm:overflow-visible">
				<Button
					render={
						<Link
							to="/$id/projects/$projectId"
							params={{ id: workspaceId, projectId }}
						/>
					}
					size={"lg"}
					variant={section === "items" ? "default" : "ghost"}
					aria-current={section === "items" ? "page" : undefined}
				>
					Work items
				</Button>
				<Button
					render={
						<Link
							to="/$id/projects/$projectId/cycles"
							params={{ id: workspaceId, projectId }}
						/>
					}
					size={"lg"}
					variant={section === "cycles" ? "default" : "ghost"}
					aria-current={section === "cycles" ? "page" : undefined}
				>
					Cycles
				</Button>
				<Button
					render={
						<Link
							to="/$id/projects/$projectId/modules"
							params={{ id: workspaceId, projectId }}
						/>
					}
					size={"lg"}
					variant={section === "modules" ? "default" : "ghost"}
					aria-current={section === "modules" ? "page" : undefined}
				>
					Modules
				</Button>
			</div>
			{view && (
				<ViewToggle
					projectId={projectId}
					workspaceId={workspaceId}
					view={view}
				/>
			)}
		</div>
	);
}
