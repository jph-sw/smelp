import type { ProjectMember } from "@smelp/db";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { AddMemberDialog } from "#/components/settings/members-project/add-member-dialog";
import { createColumns } from "#/components/settings/members-project/columns";
import { DataTable } from "#/components/settings/members-project/data-table";
import { toast } from "#/components/ui/toast";
import { currentUserQueryOptions } from "#/lib/auth";
import {
	projectMembersQueryOptions,
	removeProjectMember,
} from "#/lib/data/project-members";

export const Route = createFileRoute(
	"/(workspace)/$id/settings/projects/$projectId/members",
)({
	component: RouteComponent,
	loader: async ({ context: { queryClient }, params: { projectId } }) => {
		await Promise.all([
			queryClient.ensureQueryData(projectMembersQueryOptions({ projectId })),
			queryClient.ensureQueryData(currentUserQueryOptions),
		]);
	},
});

function RouteComponent() {
	const { projectId } = Route.useParams();
	const queryClient = useQueryClient();
	const { data: members } = useSuspenseQuery(
		projectMembersQueryOptions({ projectId }),
	);
	const { data: currentUser } = useSuspenseQuery(currentUserQueryOptions);

	const currentMember = members.find((m) => m.userId === currentUser?.id);
	const canManageMembers =
		currentUser?.role === "admin" || currentMember?.role === "admin";

	const handleRemove = async (member: ProjectMember) => {
		try {
			await removeProjectMember({ projectId, memberId: member.id });
			await queryClient.invalidateQueries({
				queryKey: ["project-members", projectId],
			});
			toast.add({
				type: "success",
				description: `Removed ${member.fullName} from the project.`,
			});
		} catch {
			toast.add({
				type: "error",
				description: "Failed to remove member.",
			});
		}
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: <TODO>
	const columns = useMemo(
		() =>
			createColumns({ canRemove: canManageMembers, onRemove: handleRemove }),
		[canManageMembers],
	);

	return (
		<div className="flex flex-col gap-1">
			<div className="mb-4 flex items-center justify-between">
				<h1 className="text-lg font-medium">Members</h1>
				{canManageMembers && <AddMemberDialog projectId={projectId} />}
			</div>
			<DataTable columns={columns} data={members} />
		</div>
	);
}
