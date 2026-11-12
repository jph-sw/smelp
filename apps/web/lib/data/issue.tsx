import { queryOptions } from "@tanstack/react-query";
import { orpc } from "../orpc";

export const issuesQueryOptions = ({ projectId }: { projectId: string }) =>
	queryOptions({
		queryKey: ["issues", projectId],
		queryFn: () => orpc.issues.find({ projectId }),
	});

export const myIssuesQueryOptions = ({
	workspaceId,
}: {
	workspaceId: string;
}) =>
	queryOptions({
		queryKey: ["my-issues", workspaceId],
		queryFn: () => orpc.issues.findMine({ workspaceId }),
	});

export const searchIssuesQueryOptions = ({
	workspaceId,
	query,
}: {
	workspaceId: string;
	query: string;
}) =>
	queryOptions({
		queryKey: ["issue-search", workspaceId, query],
		queryFn: () => orpc.issues.search({ workspaceId, query }),
		// The server skips queries this short, so there's nothing to ask for.
		enabled: query.trim().length >= 2,
	});

export const issueQueryOptions = ({ issueId }: { issueId: string }) =>
	queryOptions({
		queryKey: ["issue", issueId],
		queryFn: () => orpc.issue.find({ issueId }),
	});

export const commentsQueryOptions = ({ issueId }: { issueId: string }) =>
	queryOptions({
		queryKey: ["comments", issueId],
		queryFn: () => orpc.comments.find({ issueId }),
	});

export const issueActivityQueryOptions = ({ issueId }: { issueId: string }) =>
	queryOptions({
		queryKey: ["activity", issueId],
		queryFn: () => orpc.activity.findForIssue({ issueId }),
	});

export const updateIssue = (input: {
	id: string;
	state?: string;
	title?: string;
	description?: string;
	assignee?: string | null;
}) => orpc.issue.update(input);

export const deleteIssue = ({ id }: { id: string }) =>
	orpc.issue.delete({ id });

export const createComment = (input: { issueId: string; body: string }) =>
	orpc.comments.create(input);

export const updateComment = (input: { commentId: string; body: string }) =>
	orpc.comments.update(input);

export const deleteComment = ({ id }: { id: string }) =>
	orpc.comments.delete({ id });

export const issueRelationsQueryOptions = ({ issueId }: { issueId: string }) =>
	queryOptions({
		queryKey: ["issue-relations", issueId],
		queryFn: () => orpc.issueRelations.find({ issueId }),
	});

export const addIssueRelation = (input: {
	issueId: string;
	relatedId: string;
	kind: "blocks" | "blocked_by" | "relates" | "duplicates" | "duplicated_by";
}) => orpc.issueRelations.add(input);

export const removeIssueRelation = (input: { issueId: string; id: string }) =>
	orpc.issueRelations.remove(input);
