export type cycle_snapshot = {
	cycleId: string;
	/** Items not cancelled when the cycle was frozen, and their estimates. */
	committedItems: number;
	committedPoints: number;
	completedItems: number;
	completedPoints: number;
	frozenAt: number;
};
