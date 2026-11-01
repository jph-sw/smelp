import { DB, type tables } from "@smelp/db";
import { requireSession } from "../lib/access";
import { base } from "../orpc";

const sql = new DB().sqlite;

export const findWorkspaces = base.handler(async ({ context }) => {
	const session = await requireSession(context.headers);

	return (await sql`
		SELECT workspace.*
		FROM workspace
		JOIN auth_space_member ON auth_space_member.spaceId = workspace.spaceId
		WHERE auth_space_member.userId = ${session.userId}
	`) as tables["workspace"][];
});
