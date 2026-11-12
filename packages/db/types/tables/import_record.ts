export type import_record = {
	id: string;
	workspaceId: string;
	/** Where the data came from, e.g. "jira". */
	source: string;
	/** The project's key in that source. */
	sourceKey: string;
	projectId: string;
	importedBy: string | null;
	importedAt: number;
	itemCount: number;
};
