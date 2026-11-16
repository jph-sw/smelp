import { Auth } from "@smelp/auth";
import { DB, type tables } from "@smelp/db";
import * as v from "valibot";
import { requireWorkspacePermission } from "../lib/access";
import { base } from "../orpc";

const sql = new DB().sqlite;
const auth = new Auth();

export const findProjects = base
	.input(v.object({ workspaceId: v.string() }))
	.handler(async ({ input, context }) => {
		const { caller } = await requireWorkspacePermission(
			context.headers,
			input.workspaceId,
			"space:read",
		);

		const projects = (await sql`
			SELECT
				project.*,
				CASE WHEN auth_space_member.id IS NOT NULL THEN 1 ELSE 0 END as isMember
			FROM project
			LEFT JOIN auth_space_member
				ON auth_space_member.spaceId = project.spaceId
				AND auth_space_member.userId = ${caller.userId}
			WHERE project.workspaceId = ${input.workspaceId}
		`) as (tables["project"] & { isMember: number })[];

		const isInstanceAdmin = await auth.isInstanceAdmin(caller.userId);

		return projects
			.filter(
				(project) =>
					isInstanceAdmin || project.access === "public" || project.isMember,
			)
			.map((project) => ({
				...project,
				isMember: Boolean(project.isMember),
				isArchived: project.archivedAt !== null,
			}));
	});
