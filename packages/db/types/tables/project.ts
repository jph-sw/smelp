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
	/** Set while the project is archived (read-only); NULL otherwise. */
	archivedAt: number | null;
	archivedBy: string | null;
	/** The board background's address, or NULL when the board has none. */
	backgroundImage: string | null;
};

export type project_background = {
	projectId: string;
	contentType: string;
	data: Uint8Array;
	updatedAt: number;
};
