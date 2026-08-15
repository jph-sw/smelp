import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/(workspace)/$id/settings/projects/$projectId/members",
)({
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<div>Hello "/(workspace)/$id/settings/projects/$projectId/members"!</div>
	);
}
