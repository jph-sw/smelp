import { Auth } from "@smelp/auth";
import { DB, type tables } from "@smelp/db";
import * as v from "valibot";
import {
	requireProjectPermission,
	requireWorkspacePermission,
} from "../lib/access";
import { base } from "../orpc";

const sql = new DB().sqlite;
const auth = new Auth();

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
				AND state."group" NOT IN ('completed', 'cancelled')
			ORDER BY issue.updatedAt DESC
		`) as (tables["issue"] & {
			projectName: string;
			stateName: string;
			stateColor: string;
		})[];
	});

const SEARCH_LIMIT = 50;

// "!" is the escape character, so "%" and "_" in what someone typed match themselves.
const escapeLike = (text: string) => text.replace(/[!%_]/g, "!$&");

export type SearchResult = Pick<
	tables["issue"],
	"id" | "title" | "projectId" | "assignee" | "updatedAt"
> & {
	projectName: string;
	stateName: string;
	stateColor: string;
	stateGroup: string;
	assigneeName: string | null;
	assigneeImage: string | null;
};

export const searchIssues = base
	.input(
		v.object({
			workspaceId: v.string(),
			query: v.pipe(v.string(), v.maxLength(200)),
		}),
	)
	.handler(async ({ input, context }) => {
		const { session } = await requireWorkspacePermission(
			context.headers,
			input.workspaceId,
			"space:read",
		);

		const query = input.query.trim();
		if (query.length < 2) return [];

		// The same rule as reading a project's issues: a member of the project, in any
		// role, or an instance admin. Being in the workspace alone isn't enough.
		const seesEverything = (await auth.isInstanceAdmin(session.userId)) ? 1 : 0;
		const pattern = `%${escapeLike(query)}%`;

		return (await sql`
			SELECT
				issue.id,
				issue.title,
				issue.projectId,
				issue.assignee,
				issue.updatedAt,
				project.name AS projectName,
				state.name AS stateName,
				state.color AS stateColor,
				state."group" AS stateGroup,
				assignee.displayName AS assigneeName,
				assignee.image AS assigneeImage
			FROM issue
			JOIN project ON project.id = issue.projectId
			JOIN state ON state.id = issue.state
			LEFT JOIN auth_user assignee ON assignee.id = issue.assignee
			WHERE project.workspaceId = ${input.workspaceId}
				AND (
					${seesEverything} = 1
					OR EXISTS (
						SELECT 1 FROM auth_space_member
						WHERE auth_space_member.spaceId = project.spaceId
							AND auth_space_member.userId = ${session.userId}
					)
				)
				AND (
					issue.title LIKE ${pattern} ESCAPE '!'
					OR lower(issue.id) = lower(${query})
				)
			ORDER BY issue.updatedAt DESC
			LIMIT ${SEARCH_LIMIT}
		`) as SearchResult[];
	});
