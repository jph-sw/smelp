export const ISSUE_TYPES = ["task", "bug", "story", "epic"] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

export type issue = {
	id: string;
	assignee: string | null;
	state: string;
	title: string;
	description: string;
	type: IssueType;
	parentId: string | null;
	moduleId: string | null;
	cycleId: string | null;
	workspaceId: string;
	projectId: string;
	createdAt: number;
	updatedAt: number;
	createdBy: string | null;
	updatedBy: string | null;
};
