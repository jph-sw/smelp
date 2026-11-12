export type module = {
	id: string;
	projectId: string;
	name: string;
	description: string;
	leadId: string | null;
	// A day, as YYYY-MM-DD.
	targetDate: string | null;
	createdAt: number;
	createdBy: string | null;
};
