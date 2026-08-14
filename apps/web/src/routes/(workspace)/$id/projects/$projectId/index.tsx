import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/(workspace)/$id/projects/$projectId/")({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/(workspace)/$id/projects/$projectId/"!</div>;
}
