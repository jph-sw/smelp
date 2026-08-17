import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { projectQueryOptions } from "#/lib/data/project";
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
			<h3 className="font-medium">{project.name}</h3>
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
