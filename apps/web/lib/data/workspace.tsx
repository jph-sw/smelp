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
