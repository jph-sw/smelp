export type workspace = {
	id: string;
	name: string;
	ownerId: string;
	image: string | null;
};

export type workspace_member = {
	id: string;
	workspaceId: string;
	userId: string;
};
