import { Auth } from "@smelp/auth";
import { DB, type tables, Utils } from "@smelp/db";
import { eventBus } from "@smelp/events";
import * as v from "valibot";
import { base } from "../orpc";

const sql = new DB().sqlite;
const utils = new Utils();
const auth = new Auth();

export const findProjects = base
	.input(v.object({ workspaceId: v.string() }))
	.handler(async ({ input }) => {
		const projects =
			(await sql`SELECT * FROM project WHERE workspaceId = ${input.workspaceId}`) as tables["project"][];

		return projects;
	});
