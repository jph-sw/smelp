import { queryOptions } from "@tanstack/react-query";
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
