import { DB, type tables } from "@smelp/db";
import * as v from "valibot";
import { canReadProject, requireIssueRead } from "../lib/access";
import { base } from "../orpc";

const sql = new DB().sqlite;

type ActivityRow = Pick<
	tables["activity_logs"],
	"id" | "action" | "field" | "oldValue" | "newValue" | "createdAt"
> & {
	actorName: string | null;
	relatedId: string | null;
	relatedProjectId: string | null;
};

export const findIssueActivity = base
	.input(v.object({ issueId: v.string() }))
	.handler(async ({ input, context }) => {
		const { issue, viewer } = await requireIssueRead(
			context.headers,
			input.issueId,
		);

		const rows = (await sql`
			SELECT
				activity_logs.id,
				activity_logs.action,
				activity_logs.field,
				activity_logs.oldValue,
				activity_logs.newValue,
				activity_logs.createdAt,
				related.id AS relatedId,
				related.projectId AS relatedProjectId,
				-- Events from GitHub have no smelp actor, only the GitHub login.
				COALESCE(
					auth_user.displayName,
					json_extract(activity_logs.metadata, '$.githubLogin')
				) AS actorName
			FROM activity_logs
			LEFT JOIN auth_user ON auth_user.id = activity_logs.actorId
			LEFT JOIN issue related
				ON related.id = json_extract(activity_logs.metadata, '$.relatedId')
			WHERE activity_logs.entityType = 'issue'
				AND activity_logs.entityId = ${issue.id}
			ORDER BY activity_logs.createdAt ASC, activity_logs.rowid ASC
		`) as ActivityRow[];

		// The related item's id only shows to people who can read its project.
		const readable = new Map<string, boolean>();
		const entries = [];
		for (const { relatedProjectId, ...entry } of rows) {
			if (relatedProjectId !== null) {
				let allowed = readable.get(relatedProjectId);
				if (allowed === undefined) {
					allowed = await canReadProject(viewer, relatedProjectId);
					readable.set(relatedProjectId, allowed);
				}
				if (!allowed) entry.relatedId = null;
			}
			entries.push(entry);
		}
		return entries;
	});
