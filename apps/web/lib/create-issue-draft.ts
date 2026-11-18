import type { IssuePriority } from "./issue-priorities";
import type { IssueType } from "./issue-types";

export type CreateIssueDraft = {
	title: string;
	description: string;
	type: IssueType;
	priority: IssuePriority;
	assignee: string | null;
};

type DraftScope = { projectId: string; parentId?: string };

export const EMPTY_CREATE_ISSUE_DRAFT: CreateIssueDraft = {
	title: "",
	description: "",
	type: "task",
	priority: "none",
	assignee: null,
};

const drafts = new Map<string, CreateIssueDraft>();

const draftKey = ({ projectId, parentId }: DraftScope) =>
	JSON.stringify([projectId, parentId ?? null]);

export function isEmptyCreateIssueDraft(draft: CreateIssueDraft) {
	return (
		draft.title === EMPTY_CREATE_ISSUE_DRAFT.title &&
		draft.description === EMPTY_CREATE_ISSUE_DRAFT.description &&
		draft.type === EMPTY_CREATE_ISSUE_DRAFT.type &&
		draft.priority === EMPTY_CREATE_ISSUE_DRAFT.priority &&
		draft.assignee === EMPTY_CREATE_ISSUE_DRAFT.assignee
	);
}

export function readCreateIssueDraft(scope: DraftScope) {
	return drafts.get(draftKey(scope)) ?? EMPTY_CREATE_ISSUE_DRAFT;
}

export function saveCreateIssueDraft(
	scope: DraftScope,
	draft: CreateIssueDraft,
) {
	if (isEmptyCreateIssueDraft(draft)) {
		deleteCreateIssueDraft(scope);
	} else {
		drafts.set(draftKey(scope), draft);
	}
}

export function deleteCreateIssueDraft(scope: DraftScope) {
	drafts.delete(draftKey(scope));
}

export function clearCreateIssueDrafts() {
	drafts.clear();
}
