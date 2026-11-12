export type NotificationType = "assigned" | "comment" | "mention";

export type notification = {
	id: string;
	userId: string;
	workspaceId: string;
	type: NotificationType;
	actorId: string | null;
	issueId: string;
	projectId: string;
	commentId: string | null;
	title: string;
	createdAt: number;
	readAt: number | null;
};
