import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/ceo")({
	component: RouteComponent,
	beforeLoad: ({ context }) => {
		if (context.user?.role !== "admin") {
			throw Route.redirect({ to: "/signin" });
		}
	},
});

function RouteComponent() {
	return (
		<div>
			<Outlet />
		</div>
	);
}
