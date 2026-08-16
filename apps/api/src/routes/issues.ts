import { DB, type tables } from "@smelp/db";
import * as v from "valibot";
import { base } from "../orpc";

const sql = new DB().sqlite;

export const findIssues = base
	.input(v.object({ workspaceId: v.string() }))
	.handler(async ({ input }) => {
		const issues =
			(await sql`SELECT * FROM issue WHERE workspaceId = ${input.workspaceId}`) as tables["issue"][];

		return issues;
	});
