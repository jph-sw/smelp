import { createFileRoute } from "@tanstack/react-router";
import { projectsQueryOptions } from "#/lib/data/project";

export const Route = createFileRoute("/(workspace)/$id/projects")({
	component: RouteComponent,
	loader: ({ context: { queryClient }, params: { id } }) => {
		return queryClient.ensureQueryData(
			projectsQueryOptions({ workspaceId: id }),
		);
	},
});

function RouteComponent() {
	return <div>Hello "/(workspace)/$id/projects"!</div>;
}
