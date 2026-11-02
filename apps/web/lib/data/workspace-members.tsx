import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { currentUserQueryOptions } from "../auth";
import { orpc } from "../orpc";

export const workspaceMembersQueryOptions = ({
	workspaceId,
}: {
	workspaceId: string;
}) =>
	queryOptions({
		queryKey: ["workspace-members", workspaceId],
		queryFn: async () => {
			const members = await orpc.workspaceMembers.find({ workspaceId });
			return members;
		},
	});

export const removeWorkspaceMember = (input: {
	workspaceId: string;
	memberId: string;
}) => orpc.workspaceMembers.remove(input);

export const updateWorkspaceMemberRole = (input: {
	workspaceId: string;
	memberId: string;
	role: "guest" | "member" | "admin";
}) => orpc.workspaceMembers.updateRole(input);

export const leaveWorkspace = (input: { workspaceId: string }) =>
	orpc.workspaceMembers.leave(input);

// What the signed-in user can do in a workspace. The API enforces these rules too;
// this only decides which controls to show.
export function useWorkspaceAccess(workspaceId: string) {
	const { data: user } = useSuspenseQuery(currentUserQueryOptions);
	const { data: members } = useSuspenseQuery(
		workspaceMembersQueryOptions({ workspaceId }),
	);

	const me = members.find((member) => member.userId === user?.id);
	const isInstanceAdmin = user?.role === "admin";

	return {
		me,
		members,
		canWrite: isInstanceAdmin || me?.role === "member" || me?.role === "admin",
		canManage: isInstanceAdmin || me?.role === "admin",
	};
}
