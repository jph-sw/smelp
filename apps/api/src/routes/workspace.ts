import { Auth } from "@smelp/auth";
import { DB, type tables, Utils } from "@smelp/db";
import type { BunRequest } from "bun";
import * as v from "valibot";

const sql = new DB().sqlite;
const utils = new Utils();
const auth = new Auth();

export async function GetWorkspacesHandler(req: BunRequest) {
	const url = new URL(req.url);
	const userId = url.searchParams.get("userId");

	const workspaces = (await sql`
		SELECT workspace.*
		FROM workspace
		JOIN workspace_member ON workspace_member.workspaceId = workspace.id
		WHERE workspace_member.userId = ${userId}
	`) as tables["workspace"][];

	utils.logger.debug(`found ${workspaces.length} workspaces`);

	return Response.json(workspaces);
}

const Params = v.object({
	name: v.pipe(v.string(), v.minLength(6), v.maxLength(32)),
});

export async function PostWorkspacesHandler(req: BunRequest) {
	const token = req.cookies.get("auth_session");
	if (!token) return Response.json({ error: "unauthorized" }, { status: 401 });

	const session = await auth.validateAuthSessionToken(token);
	if (!session)
		return Response.json({ error: "unauthorized" }, { status: 401 });

	const json = await req.json();
	const params = v.safeParse(Params, json);
	if (!params.success) {
		return Response.json(
			{ error: "validation", issues: params.issues },
			{ status: 400 },
		);
	}

	const slug = utils.toSlug(params.output.name);

	const workspace: tables["workspace"] = {
		id: slug,
		name: params.output.name,
		ownerId: session.userId,
		image: null,
	};

	const workspace_member: tables["workspace_member"] = {
		id: crypto.randomUUID(),
		workspaceId: workspace.id,
		userId: session.userId,
	};

	await sql`INSERT INTO workspace ${sql(workspace)}`;
	await sql`INSERT INTO workspace_member ${sql(workspace_member)}`;

	return Response.json({ workspace }, { status: 201 });
}
