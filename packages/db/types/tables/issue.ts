export const ISSUE_TYPES = ["task", "bug", "story", "epic"] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

export const ISSUE_PRIORITIES = [
	"none",
	"low",
	"medium",
	"high",
	"urgent",
] as const;
export type IssuePriority = (typeof ISSUE_PRIORITIES)[number];

export type issue = {
	id: string;
	assignee: string | null;
	state: string;
	title: string;
	description: string;
	type: IssueType;
	priority: IssuePriority;
	parentId: string | null;
	moduleId: string | null;
	cycleId: string | null;
	/** A whole day as YYYY-MM-DD. */
	dueDate: string | null;
	/** Story points. */
	estimate: number | null;
	workspaceId: string;
	projectId: string;
	createdAt: number;
	updatedAt: number;
	createdBy: string | null;
	updatedBy: string | null;
};
