import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/ceo/")({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Instance-wide settings!</div>;
}
