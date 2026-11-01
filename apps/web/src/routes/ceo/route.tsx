import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/ceo")({
	component: RouteComponent,
	beforeLoad: ({ context }) => {
		if (context.user == null) throw redirect({ to: "/signin" });
		if (context.user.role !== "admin") throw redirect({ to: "/" });
	},
});

function RouteComponent() {
	return (
		<div className="mx-auto w-full max-w-3xl p-4 sm:p-8">
			<Outlet />
		</div>
	);
}
