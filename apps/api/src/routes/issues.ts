import { Auth } from "@smelp/auth";
import { DB, type tables } from "@smelp/db";
import type { SQL } from "bun";
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
			{
				public: true,
			},
		);

		const issues =
			(await sql`SELECT * FROM issue WHERE projectId = ${input.projectId} ORDER BY updatedAt DESC`) as tables["issue"][];

		return issues;
	});

export const findMyIssues = base
	.input(v.object({ workspaceId: v.string() }))
	.handler(async ({ input, context }) => {
		const { caller } = await requireWorkspacePermission(
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
				AND auth_space_member.userId = ${caller.userId}
			WHERE issue.workspaceId = ${input.workspaceId}
				AND issue.assignee = ${caller.userId}
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

// Members of a project, in any role, find its issues. Being in the workspace alone
// isn't enough. Instance admins also find public projects' issues, but never a
// private project's unless they're in it: searching shouldn't reach past that.
async function findReadableIssues(
	workspaceId: string,
	userId: string,
	matches: SQL.Query<unknown>,
) {
	const isInstanceAdmin = (await auth.isInstanceAdmin(userId)) ? 1 : 0;

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
		WHERE project.workspaceId = ${workspaceId}
			AND (
				(${isInstanceAdmin} = 1 AND project.access = 'public')
				OR EXISTS (
					SELECT 1 FROM auth_space_member
					WHERE auth_space_member.spaceId = project.spaceId
						AND auth_space_member.userId = ${userId}
				)
			)
			AND ${matches}
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
}

export const searchIssues = base
	.input(
		v.object({
			workspaceId: v.string(),
			query: v.pipe(v.string(), v.maxLength(200)),
		}),
	)
	.handler(async ({ input, context }) => {
		const { caller } = await requireWorkspacePermission(
			context.headers,
			input.workspaceId,
			"space:read",
		);

		const query = input.query.trim();
		if (query.length < 2) return [];

		const pattern = `%${escapeLike(query)}%`;
		return findReadableIssues(
			input.workspaceId,
			caller.userId,
			sql`(
				issue.title LIKE ${pattern} ESCAPE '!'
				OR lower(issue.id) = lower(${query})
			)`,
		);
	});

// Answers in the order asked, leaving out items that are gone or can't be read.
export const findIssuesByIds = base
	.input(
		v.object({
			workspaceId: v.string(),
			ids: v.pipe(
				v.array(v.pipe(v.string(), v.maxLength(200))),
				v.maxLength(SEARCH_LIMIT),
			),
		}),
	)
	.handler(async ({ input, context }) => {
		const { caller } = await requireWorkspacePermission(
			context.headers,
			input.workspaceId,
			"space:read",
		);
		if (input.ids.length === 0) return [];

		const issues = await findReadableIssues(
			input.workspaceId,
			caller.userId,
			sql`issue.id IN ${sql(input.ids)}`,
		);
		const byId = new Map(issues.map((issue) => [issue.id, issue]));
		return [...new Set(input.ids)].flatMap((id) => byId.get(id) ?? []);
	});
