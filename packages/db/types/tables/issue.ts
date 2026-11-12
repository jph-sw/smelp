export type issue = {
	id: string;
	assignee: string | null;
	state: string;
	title: string;
	description: string;
	type: string;
	parentId: string | null;
	moduleId: string | null;
	workspaceId: string;
	projectId: string;
	createdAt: number;
	updatedAt: number;
	createdBy: string | null;
	updatedBy: string | null;
};
