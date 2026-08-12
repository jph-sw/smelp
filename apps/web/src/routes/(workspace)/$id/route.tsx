import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "#/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "#/components/ui/popover";
import { workspaceQueryOptions } from "#/lib/data/workspace";
import { ApiError } from "#/lib/utils";

export const Route = createFileRoute("/(workspace)/$id")({
	component: RouteComponent,
	loader: ({ context: { queryClient }, params: { id } }) => {
		return queryClient.ensureQueryData(
			workspaceQueryOptions({ workspaceId: id }),
		);
	},
	errorComponent: ({ error }) => {
		if (error instanceof ApiError && error.status === 404) {
			return <div>Workspace not found.</div>;
		}
		return <div>Something went wrong loading this workspace.</div>;
	},
});

function RouteComponent() {
	const { id: workspaceId } = Route.useParams();
	const { user } = Route.useRouteContext();

	const { data: workspace } = useSuspenseQuery(
		workspaceQueryOptions({ workspaceId }),
	);

	return (
		<div>
			<div className="h-10 border-b w-full flex items-center px-2">
				<Popover>
					<PopoverTrigger render={<Button variant="outline" />}>
						{workspace.name}
					</PopoverTrigger>
					<PopoverContent className={"px-0 gap-0"}>
						<div className="px-2 mb-2">
							<span>{user?.email}</span>
						</div>
						<div className="px-2 py-4 grid gap-2 bg-secondary">
							<span className="text-lg">{workspace.name}</span>
							<div>
								<Button>Settings</Button>
							</div>
						</div>
					</PopoverContent>
				</Popover>
			</div>
		</div>
	);
}
