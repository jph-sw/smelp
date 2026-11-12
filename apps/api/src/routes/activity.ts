import { ORPCError } from "@orpc/server";
import { DB, type tables } from "@smelp/db";
import * as v from "valibot";
import { requireProjectPermission, requireSession } from "../lib/access";
import { base } from "../orpc";

const sql = new DB().sqlite;

export const findIssueActivity = base
	.input(v.object({ issueId: v.string() }))
	.handler(async ({ input, context }) => {
		await requireSession(context.headers);

		const issue = (
			await sql`SELECT projectId FROM issue WHERE id = ${input.issueId}`
		)[0] as Pick<tables["issue"], "projectId"> | undefined;
		if (!issue) throw new ORPCError("NOT_FOUND");

		await requireProjectPermission(
			context.headers,
			issue.projectId,
			"space:read",
		);

		return (await sql`
			SELECT
				activity_logs.id,
				activity_logs.action,
				activity_logs.field,
				activity_logs.oldValue,
				activity_logs.newValue,
				activity_logs.createdAt,
				auth_user.displayName AS actorName
			FROM activity_logs
			LEFT JOIN auth_user ON auth_user.id = activity_logs.actorId
			WHERE activity_logs.entityType = 'issue'
				AND activity_logs.entityId = ${input.issueId}
			ORDER BY activity_logs.createdAt ASC, activity_logs.rowid ASC
		`) as (Pick<
			tables["activity_logs"],
			"id" | "action" | "field" | "oldValue" | "newValue" | "createdAt"
		> & { actorName: string | null })[];
	});
