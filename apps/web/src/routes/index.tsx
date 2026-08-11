import type { tables } from "@smelp/db";
import {
	queryOptions,
	useQuery,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

const workspacesQueryOptions = ({ userId }: { userId: string }) =>
	queryOptions({
		queryKey: ["workspaces", userId],
		queryFn: async () => {
			const res = await fetch(`/api/workspaces?userId=${userId}`);
			const body = (await res.json()) as tables["workspace"][];
			return body;
		},
	});

export const Route = createFileRoute("/")({
	component: Home,
	loader: ({ context: { queryClient, user } }) => {
		if (user != null) {
			return queryClient.ensureQueryData(
				workspacesQueryOptions({ userId: user.id }),
			);
		}
	},
});

function Home() {
	const { user } = Route.useRouteContext();
	const navigate = Route.useNavigate();

	if (user === null) {
		throw navigate({ to: "/signin" });
	}

	const { data: workspaces } = useSuspenseQuery(
		workspacesQueryOptions({ userId: user.id }),
	);

	if (workspaces && workspaces?.length > 0) {
		console.log("redirecting");
		navigate({ to: "/$id", params: { id: workspaces[0].id } });
	}

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
		</div>
	);
}
