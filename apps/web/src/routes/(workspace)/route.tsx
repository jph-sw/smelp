import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/(workspace)")({
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
			<div className="w-full h-10 border-b"></div>
			<Outlet />
		</div>
	);
}
