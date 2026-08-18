export type project = {
	id: string;
	name: string;
	description: string | null;
	access: "public" | "private";
	leadUserId: string | null;
	defaultAssigneeUserId: string | null;
	image: string | null;
	icon: string;
	workspaceId: string;
	spaceId: string;
	createdBy: string;
	createdAt: number;
	updatedAt: number;
};
