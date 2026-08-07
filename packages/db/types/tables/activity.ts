export type activity_logs = {
	id: string;
	workspaceId: string;
	entityType: string;
	entityId: string;
	action: string;
	actorId: string | null;
	field: string | null;
	oldValue: string | null;
	newValue: string | null;
	metadata: string | null;
	createdAt: number;
};
