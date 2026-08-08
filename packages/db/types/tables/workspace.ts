export type workspace = {
	id: string;
	name: string;
	ownerId: string;
	network: "public" | "private";
};

export type workspace_member = {
	id: string;
	workspaceId: string;
	userId: string;
};
