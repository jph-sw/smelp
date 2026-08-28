import { queryOptions } from "@tanstack/react-query";
import { orpc } from "../orpc";

export const workspacesQueryOptions = ({ userId }: { userId: string }) =>
	queryOptions({
		queryKey: ["workspaces", userId],
		queryFn: async () => {
			const workspaces = orpc.workspaces.find({ userId });
			return workspaces;
		},
	});

export const workspaceQueryOptions = ({
	workspaceId,
}: {
	workspaceId: string;
}) =>
	queryOptions({
		queryKey: ["workspace", workspaceId],
		queryFn: async () => {
			const workspace = await orpc.workspace.find({ workspaceId });
			return workspace;
		},
	});

export const updateWorkspace = ({
	workspaceId,
	name,
}: {
	workspaceId: string;
	name: string;
}) => orpc.workspace.update({ workspaceId, name });

export const deleteWorkspace = ({ workspaceId }: { workspaceId: string }) =>
	orpc.workspace.delete({ workspaceId });
