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
		<div className="w-full flex h-12 border-b items-center gap-2 px-4">
			<Link
				className="flex items-center gap-2 group"
				to="/$id/projects/$projectId"
				params={{ projectId: project.id, id: workspaceId }}
			>
				<div className="flex items-center justify-center bg-secondary p-1.5 rounded-sm">
					<DynamicIcon name={project.icon} className="size-4" />
				</div>
				<h3 className="font-medium group-hover:underline">{project.name}</h3>
			</Link>
			<div className="ms-4 flex gap-2 items-center">
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
