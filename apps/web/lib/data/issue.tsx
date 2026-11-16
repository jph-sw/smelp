import type { IssueType, tables } from "@smelp/db";
import { queryOptions } from "@tanstack/react-query";
import { orpc } from "../orpc";
import type { ReactionEmoji } from "../reactions";

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
	type?: IssueType;
	assignee?: string | null;
	parentId?: string | null;
	moduleId?: string | null;
	cycleId?: string | null;
}) => orpc.issue.update(input);

export const deleteIssue = ({ id }: { id: string }) =>
	orpc.issue.delete({ id });

export const linksQueryOptions = ({ issueId }: { issueId: string }) =>
	queryOptions({
		queryKey: ["links", issueId],
		queryFn: () => orpc.links.find({ issueId }),
	});

export const createLink = (input: {
	issueId: string;
	url: string;
	title?: string;
}) => orpc.links.create(input);

export const updateLink = (input: {
	id: string;
	url: string;
	title?: string;
}) => orpc.links.update(input);

export const deleteLink = ({ id }: { id: string }) => orpc.links.delete({ id });

export const createComment = (input: { issueId: string; body: string }) =>
	orpc.comments.create(input);

export const updateComment = (input: { commentId: string; body: string }) =>
	orpc.comments.update(input);

export const deleteComment = ({ id }: { id: string }) =>
	orpc.comments.delete({ id });

export const attachmentsQueryOptions = ({ issueId }: { issueId: string }) =>
	queryOptions({
		queryKey: ["attachments", issueId],
		queryFn: () => orpc.attachments.find({ issueId }),
	});

export const deleteAttachment = ({ id }: { id: string }) =>
	orpc.attachments.delete({ id });

export const attachmentLimitsQueryOptions = queryOptions({
	queryKey: ["attachment-limits"],
	queryFn: () => orpc.attachments.limits(),
	staleTime: Number.POSITIVE_INFINITY,
});

export type UploadedAttachment = Omit<tables["attachment"], "storageKey">;

// Its message is written for the user, like the server's own refusals.
export class AttachmentUploadError extends Error {}

// Not an RPC call, because the file goes up as a plain multipart request.
export async function uploadAttachment(input: {
	issueId: string;
	commentId?: string;
	file: File;
}): Promise<UploadedAttachment> {
	const query = new URLSearchParams({ issueId: input.issueId });
	if (input.commentId) query.set("commentId", input.commentId);
	const body = new FormData();
	body.set("file", input.file);

	let response: Response;
	try {
		response = await fetch(`/api/attachments?${query}`, {
			method: "POST",
			// The server only takes uploads that carry this, which a page on another
			// site can't add.
			headers: { "X-Smelp-Upload": "1" },
			body,
			credentials: "include",
		});
	} catch {
		throw new AttachmentUploadError(
			"The upload failed. Check your connection.",
		);
	}
	if (!response.ok) {
		const message = (await response.text().catch(() => "")).slice(0, 200);
		throw new AttachmentUploadError(message || "The upload failed.");
	}
	return response.json();
}

export const setReaction = (input: {
	commentId: string;
	emoji: ReactionEmoji;
	reacted: boolean;
}) => orpc.comments.setReaction(input);

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
