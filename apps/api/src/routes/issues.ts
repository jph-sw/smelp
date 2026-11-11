import { DB, type tables } from "@smelp/db";
import * as v from "valibot";
import {
	requireProjectPermission,
	requireWorkspacePermission,
} from "../lib/access";
import { base } from "../orpc";

const sql = new DB().sqlite;

export const findIssues = base
	.input(v.object({ projectId: v.string() }))
	.handler(async ({ input, context }) => {
		await requireProjectPermission(
			context.headers,
			input.projectId,
			"space:read",
		);

		const issues =
			(await sql`SELECT * FROM issue WHERE projectId = ${input.projectId} ORDER BY updatedAt DESC`) as tables["issue"][];

		return issues;
	});

export const findMyIssues = base
	.input(v.object({ workspaceId: v.string() }))
	.handler(async ({ input, context }) => {
		const { session } = await requireWorkspacePermission(
			context.headers,
			input.workspaceId,
			"space:read",
		);

		return (await sql`
			SELECT
				issue.*,
				project.name AS projectName,
				state.name AS stateName,
				state.color AS stateColor
			FROM issue
			JOIN project ON project.id = issue.projectId
			JOIN state ON state.id = issue.state
			JOIN auth_space_member
				ON auth_space_member.spaceId = project.spaceId
				AND auth_space_member.userId = ${session.userId}
			WHERE issue.workspaceId = ${input.workspaceId}
				AND issue.assignee = ${session.userId}
				AND project.archivedAt IS NULL
				AND state."group" NOT IN ('completed', 'cancelled')
			ORDER BY issue.updatedAt DESC
		`) as (tables["issue"] & {
			projectName: string;
			stateName: string;
			stateColor: string;
		})[];
	});
