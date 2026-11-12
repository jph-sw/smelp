export type cycle = {
	id: string;
	projectId: string;
	name: string;
	/** Whole days as YYYY-MM-DD. */
	startDate: string;
	endDate: string;
	createdBy: string | null;
	createdAt: number;
};
