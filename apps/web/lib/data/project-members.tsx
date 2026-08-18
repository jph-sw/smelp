import { queryOptions } from "@tanstack/react-query";
import { orpc } from "../orpc";

export const projectMembersQueryOptions = ({
	projectId,
}: {
	projectId: string;
}) =>
	queryOptions({
		queryKey: ["project-members", projectId],
		queryFn: async () => {
			const members = await orpc.projectMembers.find({ projectId });
			return members;
		},
	});
