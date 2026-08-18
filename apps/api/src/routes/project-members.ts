import { ORPCError } from "@orpc/server";
import { getCookie } from "@orpc/server/helpers";
import { Auth } from "@smelp/auth";
import { DB, type tables } from "@smelp/db";
import * as v from "valibot";
import { base } from "../orpc";

const sql = new DB().sqlite;
const auth = new Auth();

type ProjectMember = tables["auth_space_member"] &
	Pick<tables["auth_user"], "fullName" | "displayName" | "email" | "image">;

export const findProjectMembers = base
	.input(v.object({ projectId: v.string() }))
	.handler(async ({ input, context }) => {
		const token = getCookie(context.headers, "auth_session");
		if (!token) throw new ORPCError("UNAUTHORIZED");

		const session = await auth.validateAuthSessionToken(token);
		if (!session) throw new ORPCError("UNAUTHORIZED");

		const project = (
			await sql`SELECT * FROM project WHERE id = ${input.projectId}`
		)[0] as tables["project"];

		if (!project) {
			throw new ORPCError("NOT_FOUND");
		}

		const allowed = await auth.userHasPermission(
			session.userId,
			project.spaceId,
			"space:read",
		);
		if (!allowed) {
			throw new ORPCError("FORBIDDEN");
		}

		const members = (await sql`
			SELECT
				auth_space_member.*,
				auth_user.fullName,
				auth_user.displayName,
				auth_user.email,
				auth_user.image
			FROM auth_space_member
			JOIN auth_user ON auth_user.id = auth_space_member.userId
			WHERE auth_space_member.spaceId = ${project.spaceId}
		`) as ProjectMember[];

		return members;
	});
