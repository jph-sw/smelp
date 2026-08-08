import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/(workspace)/create-workspace")({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/(workspace)/create-workspace"!</div>;
}
