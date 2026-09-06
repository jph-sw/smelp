import { ORPCError } from "@orpc/server";
import { getCookie } from "@orpc/server/helpers";
import { Auth } from "@smelp/auth";
import { DB, type tables } from "@smelp/db";
import * as v from "valibot";
import { base } from "../orpc";

const sql = new DB().sqlite;
const auth = new Auth();

type WorkspaceMember = tables["auth_space_member"] &
	Pick<tables["auth_user"], "fullName" | "displayName" | "email" | "image">;

export const findWorkspaceMembers = base
	.input(v.object({ workspaceId: v.string() }))
	.handler(async ({ input, context }) => {
		const token = getCookie(context.headers, "auth_session");
		if (!token) throw new ORPCError("UNAUTHORIZED");

		const session = await auth.validateAuthSessionToken(token);
		if (!session) throw new ORPCError("UNAUTHORIZED");

		const workspace = (
			await sql`SELECT * FROM workspace WHERE id = ${input.workspaceId}`
		)[0] as tables["workspace"];

		if (!workspace) {
			throw new ORPCError("NOT_FOUND");
		}

		const allowed = await auth.userHasPermission(
			session.userId,
			workspace.spaceId,
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
			WHERE auth_space_member.spaceId = ${workspace.spaceId}
		`) as WorkspaceMember[];

		return members;
	});
