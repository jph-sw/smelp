import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { projectQueryOptions } from "#/lib/data/project";
import { DynamicIcon } from "../dynamic-icon";
import { Button } from "../ui/button";

export function ProjectHeader({
	projectId,
	workspaceId,
}: {
	projectId: string;
	workspaceId: string;
}) {
	const { data: project } = useSuspenseQuery(
		projectQueryOptions({ projectId }),
	);

	return (
		<div className="flex h-12 w-full shrink-0 items-center gap-2 overflow-x-auto border-b px-4">
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
			<div className="ms-2 flex shrink-0 items-center gap-2 sm:ms-4">
				<Button
					render={
						<Link
							to="/$id/projects/$projectId"
							params={{ id: workspaceId, projectId }}
						/>
					}
					size={"lg"}
					variant={"default"}
				>
					Work items
				</Button>
				<Button
					render={
						<Link
							to="/$id/projects/$projectId"
							params={{ id: workspaceId, projectId }}
						/>
					}
					size={"lg"}
					variant={"secondary"}
				>
					Cycles
				</Button>
				<Button
					render={
						<Link
							to="/$id/projects/$projectId"
							params={{ id: workspaceId, projectId }}
						/>
					}
					size={"lg"}
					variant={"secondary"}
				>
					Modules
				</Button>
			</div>
		</div>
	);
}
