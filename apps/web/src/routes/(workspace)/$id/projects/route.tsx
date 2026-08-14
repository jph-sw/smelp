import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/(workspace)/$id/projects")({
	component: RouteComponent,
});

function RouteComponent() {
	return <Outlet />;
}
