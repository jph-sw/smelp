import { queryOptions } from "@tanstack/react-query";
import { orpc } from "../orpc";

// The API returns the signed-in user's workspaces; userId only scopes the cache.
export const workspacesQueryOptions = ({ userId }: { userId: string }) =>
	queryOptions({
		queryKey: ["workspaces", userId],
		queryFn: () => orpc.workspaces.find(),
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

export const updateWorkspace = (input: {
	workspaceId: string;
	name?: string;
	public?: boolean;
}) => orpc.workspace.update(input);

export const deleteWorkspace = ({ workspaceId }: { workspaceId: string }) =>
	orpc.workspace.delete({ workspaceId });
