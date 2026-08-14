import { ORPCError, os } from "@orpc/server";
import { Auth } from "@smelp/auth";
import { DB, type tables, Utils } from "@smelp/db";
import { eventBus } from "@smelp/events";
import type { BunRequest } from "bun";
import * as v from "valibot";

const sql = new DB().sqlite;
const utils = new Utils();
const auth = new Auth();

export const findWorkspace = os
	.input(v.object({ workspaceId: v.string() }))
	.handler(async ({ input }) => {
		try {
			const workspace = (
				await sql`SELECT * FROM workspace WHERE id = ${input.workspaceId}`
			)[0] as tables["workspace"];

			return workspace;
		} catch (e) {
			console.log(e);
			throw new ORPCError("NOT_FOUND");
		}
	});

const PostWorkspacesHandlerParams = v.object({
	name: v.pipe(v.string(), v.minLength(6), v.maxLength(32)),
});

export async function PostWorkspacesHandler(req: BunRequest) {
	const token = req.cookies.get("auth_session");
	if (!token) return Response.json({ error: "unauthorized" }, { status: 401 });

	const session = await auth.validateAuthSessionToken(token);
	if (!session)
		return Response.json({ error: "unauthorized" }, { status: 401 });

	const json = await req.json();
	const params = v.safeParse(PostWorkspacesHandlerParams, json);
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

	eventBus.emit({
		type: "workspace.created",
		workspaceId: workspace.id,
		actorId: workspace.ownerId,
		entityId: "",
		payload: {
			name: workspace.name,
		},
	});

	return Response.json({ workspace }, { status: 201 });
}
