export type RelationType = "blocks" | "duplicates" | "relates";

export type issue_relation = {
	id: string;
	sourceId: string;
	targetId: string;
	type: RelationType;
	createdAt: number;
	createdBy: string | null;
};
