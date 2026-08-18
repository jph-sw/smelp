import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/(workspace)")({
	component: RouteComponent,
	beforeLoad: ({ context }) => {
		if (context.user == null) {
			throw Route.redirect({ to: "/signin" });
		}
	},
});

function RouteComponent() {
	return <Outlet />;
}
