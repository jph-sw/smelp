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
