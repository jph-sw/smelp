import { queryOptions } from "@tanstack/react-query";
import { orpc } from "../orpc";

export const projectsQueryOptions = ({
	workspaceId,
}: {
	workspaceId: string;
}) =>
	queryOptions({
		queryKey: ["projects", workspaceId],
		queryFn: async () => {
			const workspaces = orpc.projects.find({ workspaceId });
			return workspaces;
		},
	});
