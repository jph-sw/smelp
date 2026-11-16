import { DB, type tables } from "@smelp/db";
import * as v from "valibot";
import { requireWorkspacePermission } from "../lib/access";
import { base } from "../orpc";

const sql = new DB().sqlite;

export const findProjects = base
	.input(v.object({ workspaceId: v.string() }))
	.handler(async ({ input, context }) => {
		const { viewer, access } = await requireWorkspacePermission(
			context.headers,
			input.workspaceId,
			"space:read",
			{ public: true },
		);
		// NULL matches no membership row, so a visitor is a member of nothing.
		const userId = viewer.kind === "user" ? viewer.userId : null;

		const projects = (await sql`
			SELECT
				project.*,
				CASE WHEN auth_space_member.id IS NOT NULL THEN 1 ELSE 0 END as isMember
			FROM project
			LEFT JOIN auth_space_member
				ON auth_space_member.spaceId = project.spaceId
				AND auth_space_member.userId = ${userId}
			WHERE project.workspaceId = ${input.workspaceId}
		`) as (tables["project"] & { isMember: number })[];

		// The same rule serves everyone: a private project shows only to its members,
		// so someone reading a public workspace from outside never sees one.
		return projects
			.filter(
				(project) =>
					access.kind === "instanceAdmin" ||
					project.access === "public" ||
					project.isMember,
			)
			.map((project) => ({
				...project,
				isMember: Boolean(project.isMember),
				isArchived: project.archivedAt !== null,
			}));
	});
