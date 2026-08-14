export type project = {
	id: string;
	name: string;
	description: string | null;
	access: "public" | "private";
	leadUserId: string | null;
	defaultAssigneeUserId: string | null;
	image: string | null;
	workspaceId: string;
	createdBy: string;
	createdAt: number;
	updatedAt: number;
};

export type project_member = {
	id: string;
	projectId: string;
	userId: string;
};
