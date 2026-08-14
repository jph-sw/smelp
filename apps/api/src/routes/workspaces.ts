import { ORPCError } from "@orpc/server";
import { DB, type tables } from "@smelp/db";
import * as v from "valibot";
import { base } from "../orpc";

const sql = new DB().sqlite;

export const findWorkspaces = base
	.input(v.object({ userId: v.string() }))
	.handler(async ({ input }) => {
		try {
			const workspaces = (await sql`
			SELECT workspace.*
			FROM workspace
			JOIN workspace_member ON workspace_member.workspaceId = workspace.id
			WHERE workspace_member.userId = ${input.userId}
		`) as tables["workspace"][];

			return workspaces;
		} catch (e) {
			console.log(e);
			throw new ORPCError("NOT_FOUND");
		}
	});
