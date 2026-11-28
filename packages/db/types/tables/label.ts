export type label = {
	id: string;
	projectId: string;
	name: string;
	/** A hex color, as #rrggbb. */
	color: string;
	createdAt: number;
};

export type issue_label = {
	issueId: string;
	labelId: string;
};
