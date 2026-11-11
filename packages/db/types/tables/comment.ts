export type comment = {
	id: string;
	issueId: string;
	authorId: string | null;
	body: string;
	createdAt: number;
	editedAt: number | null;
};
