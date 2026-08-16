import { createFileRoute } from "@tanstack/react-router";
import { issuesQueryOptions } from "#/lib/data/issue";

export const Route = createFileRoute("/(workspace)/$id/projects/$projectId/")({
	component: RouteComponent,
	loader: ({ context: { queryClient }, params: { projectId } }) => {
		return queryClient.ensureQueryData(issuesQueryOptions({ projectId }));
	},
});

function RouteComponent() {
	return <div>Hello "/(workspace)/$id/projects/$projectId/"!</div>;
}
