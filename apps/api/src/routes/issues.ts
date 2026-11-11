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
				AND project.archivedAt IS NULL
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
	// Archived projects stay searchable, marked so it's clear they're read-only.
	projectArchived: boolean;
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

		// Members of a project, in any role, find its issues. Being in the workspace alone
		// isn't enough. Instance admins also find public projects' issues, but never a
		// private project's unless they're in it: searching shouldn't reach past that.
		const isInstanceAdmin = (await auth.isInstanceAdmin(session.userId))
			? 1
			: 0;
		const pattern = `%${escapeLike(query)}%`;

		const rows = (await sql`
			SELECT
				issue.id,
				issue.title,
				issue.projectId,
				issue.assignee,
				issue.updatedAt,
				project.name AS projectName,
				project.archivedAt IS NOT NULL AS projectArchived,
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
					(${isInstanceAdmin} = 1 AND project.access = 'public')
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
		`) as (Omit<SearchResult, "projectArchived"> & {
			projectArchived: number;
		})[];
		// SQLite answers 0 or 1, which the page would print as text.
		return rows.map(
			(row): SearchResult => ({
				...row,
				projectArchived: row.projectArchived === 1,
			}),
		);
	});
