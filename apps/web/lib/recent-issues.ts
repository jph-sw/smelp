const RECENT_LIMIT = 10;

const storageKey = (userId: string | undefined, workspaceId: string) =>
	`smelp.recent-issues.${userId}.${workspaceId}`;

/** The work items this person last opened here, newest first, kept in this browser. */
export function readRecentIssues(
	userId: string | undefined,
	workspaceId: string,
): string[] {
	try {
		const stored = JSON.parse(
			localStorage.getItem(storageKey(userId, workspaceId)) ?? "[]",
		);
		return Array.isArray(stored)
			? stored
					.filter((id): id is string => typeof id === "string")
					.slice(0, RECENT_LIMIT)
			: [];
	} catch {
		return [];
	}
}

export function recordRecentIssue(
	userId: string | undefined,
	workspaceId: string,
	issueId: string,
) {
	const ids = [
		issueId,
		...readRecentIssues(userId, workspaceId).filter((id) => id !== issueId),
	].slice(0, RECENT_LIMIT);
	try {
		localStorage.setItem(storageKey(userId, workspaceId), JSON.stringify(ids));
	} catch {}
}
