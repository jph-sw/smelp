import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { columns } from "#/components/settings/members-project/columns";
import { DataTable } from "#/components/settings/members-project/data-table";
import { projectMembersQueryOptions } from "#/lib/data/project-members";

export const Route = createFileRoute(
	"/(workspace)/$id/settings/projects/$projectId/members",
)({
	component: RouteComponent,
	loader: async ({ context: { queryClient }, params: { projectId } }) => {
		await queryClient.ensureQueryData(
			projectMembersQueryOptions({ projectId }),
		);
	},
});

function RouteComponent() {
	const { projectId } = Route.useParams();
	const { data: members } = useSuspenseQuery(
		projectMembersQueryOptions({ projectId }),
	);

	return (
		<div className="flex flex-col gap-1">
			<h1 className="text-2xl mb-4">Members</h1>
			<DataTable columns={columns} data={members} />
		</div>
	);
}
