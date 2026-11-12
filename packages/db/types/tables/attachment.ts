export type attachment = {
	id: string;
	issueId: string;
	commentId: string | null;
	uploaderId: string | null;
	name: string;
	size: number;
	contentType: string;
	storageKey: string;
	createdAt: number;
};
