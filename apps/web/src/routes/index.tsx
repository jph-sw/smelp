import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
	component: Home,
});

function Home() {
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
		</div>
	);
}
