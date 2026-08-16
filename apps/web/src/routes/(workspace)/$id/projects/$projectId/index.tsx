import { createFileRoute } from "@tanstack/react-router";
import { issuesQueryOptions } from "#/lib/data/issue";
import { statesQueryOptions } from "#/lib/data/state";

export const Route = createFileRoute("/(workspace)/$id/projects/$projectId/")({
	component: RouteComponent,
	loader: async ({ context: { queryClient }, params: { projectId } }) => {
		await Promise.all([
			queryClient.ensureQueryData(statesQueryOptions({ projectId })),
			queryClient.ensureQueryData(issuesQueryOptions({ projectId })),
		]);
	},
});

function RouteComponent() {
	return <div>Hello "/(workspace)/$id/projects/$projectId/"!</div>;
}
