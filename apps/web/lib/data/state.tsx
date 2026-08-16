import { queryOptions } from "@tanstack/react-query";
import { orpc } from "../orpc";

export const statesQueryOptions = ({ projectId }: { projectId: string }) =>
	queryOptions({
		queryKey: ["states", projectId],
		queryFn: async () => {
			const states = orpc.states.find({ projectId });
			return states;
		},
	});
