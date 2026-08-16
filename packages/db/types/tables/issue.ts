export type issue = {
	id: string;
	assignee: string | null;
	state: string;
	title: string;
	description: string;
	type: string;
	parentId: string | null;
	workspaceId: string;
	projectId: string;
	createdAt: number;
	updatedAt: number;
};
