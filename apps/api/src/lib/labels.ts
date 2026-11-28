import { DB } from "@smelp/db";

const sql = new DB().sqlite;

type Link = { issueId: string; labelId: string };

// An item's labels are listed by name, the order they show in.
export async function labelIdsByIssue(projectId: string) {
	const links = (await sql`
		SELECT issue_label.issueId, issue_label.labelId
		FROM issue_label
		JOIN label ON label.id = issue_label.labelId
		WHERE label.projectId = ${projectId}
		ORDER BY label.name COLLATE NOCASE, label.id
	`) as Link[];
	const byIssue = new Map<string, string[]>();
	for (const { issueId, labelId } of links) {
		const ids = byIssue.get(issueId) ?? [];
		ids.push(labelId);
		byIssue.set(issueId, ids);
	}
	return byIssue;
}

export async function labelIdsOfIssue(issueId: string) {
	const links = (await sql`
		SELECT issue_label.labelId
		FROM issue_label
		JOIN label ON label.id = issue_label.labelId
		WHERE issue_label.issueId = ${issueId}
		ORDER BY label.name COLLATE NOCASE, label.id
	`) as Pick<Link, "labelId">[];
	return links.map((link) => link.labelId);
}
