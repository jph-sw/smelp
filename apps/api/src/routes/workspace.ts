import { ORPCError } from "@orpc/server";
import { getCookie } from "@orpc/server/helpers";
import { Auth } from "@smelp/auth";
import { DB, type tables, Utils } from "@smelp/db";
import { eventBus } from "@smelp/events";
import { SQL } from "bun";
import * as v from "valibot";
import { base } from "../orpc";

const sql = new DB().sqlite;
const utils = new Utils();
const auth = new Auth();

export const findWorkspace = base
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

export const createWorkspace = base
	.input(
		v.object({
			name: v.pipe(v.string(), v.minLength(6), v.maxLength(32)),
		}),
	)
	.handler(async ({ input, context }) => {
		const token = getCookie(context.headers, "auth_session");
		if (!token) throw new ORPCError("UNAUTHORIZED");

		const session = await auth.validateAuthSessionToken(token);
		if (!session) throw new ORPCError("UNAUTHORIZED");

		const slug = utils.toSlug(input.name);

		const workspace: tables["workspace"] = {
			id: slug,
			name: input.name,
			ownerId: session.userId,
			image: null,
		};

		const workspace_member: tables["workspace_member"] = {
			id: crypto.randomUUID(),
			workspaceId: workspace.id,
			userId: session.userId,
		};

		try {
			await sql`INSERT INTO workspace ${sql(workspace)}`;
		} catch (e) {
			if (e instanceof SQL.SQLiteError) {
				if (e.code === "SQLITE_CONSTRAINT_PRIMARYKEY") {
					throw new ORPCError("CONFLICT", {
						message: "A workspace with this name already exists",
					});
				}
			}
		}
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

		return workspace;
	});
