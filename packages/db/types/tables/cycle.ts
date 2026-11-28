export type cycle = {
	id: string;
	projectId: string;
	name: string;
	/** Whole days as YYYY-MM-DD. */
	startDate: string;
	endDate: string;
	/** Plain text; null when the cycle has none. */
	goal: string | null;
	createdBy: string | null;
	createdAt: number;
};
