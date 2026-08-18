import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { workspacesQueryOptions } from "#/lib/data/workspace";

export const Route = createFileRoute("/")({
	component: Home,
	loader: async ({ context: { queryClient, user } }) => {
		if (user == null) {
			throw redirect({ to: "/signin" });
		}

		const workspaces = await queryClient.ensureQueryData(
			workspacesQueryOptions({ userId: user.id }),
		);

		if (workspaces && workspaces.length > 0) {
			throw redirect({ to: "/$id", params: { id: workspaces[0].id } });
		}

		return workspaces;
	},
});

function Home() {
	const workspaces = Route.useLoaderData();

	const { data, isLoading } = useQuery({
		queryKey: ["status"],
		queryFn: async () => {
			const res = await fetch("/api/status");
			return res.text();
		},
	});

	return (
		<div>
			<h1>smelp</h1>
			<p>API status: {isLoading ? "..." : data}</p>

			<p>Workspaces: {workspaces.length}</p>
			<p>
				<Link to="/invites">View your invites</Link>
			</p>
		</div>
	);
}
