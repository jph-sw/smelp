import { DB, type tables } from "@smelp/db";
import * as v from "valibot";
import { base } from "../orpc";

const sql = new DB().sqlite;

export const findProjects = base
	.input(v.object({ workspaceId: v.string() }))
	.handler(async ({ input }) => {
		const projects =
			(await sql`SELECT * FROM project WHERE workspaceId = ${input.workspaceId}`) as tables["project"][];

		return projects;
	});
