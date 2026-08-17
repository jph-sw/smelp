import { queryOptions } from "@tanstack/react-query";
import { orpc } from "../orpc";

export const issuesQueryOptions = ({ projectId }: { projectId: string }) =>
	queryOptions({
		queryKey: ["issues", projectId],
		queryFn: async () => {
			const issues = orpc.issues.find({ projectId });
			return issues;
		},
	});

export const updateIssue = ({ id, state }: { id: string; state: string }) =>
	orpc.issue.update({ id, state });
