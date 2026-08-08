export type workspace = {
	id: string;
	name: string;
};

export type workspace_member = {
	id: string;
	workspaceId: string;
	userId: string;
};
