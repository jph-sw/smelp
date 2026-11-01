import { DB, type tables } from "@smelp/db";
import * as v from "valibot";
import { requireProjectPermission } from "../lib/access";
import { base } from "../orpc";

const sql = new DB().sqlite;

export const findStates = base
	.input(v.object({ projectId: v.string() }))
	.handler(async ({ input, context }) => {
		await requireProjectPermission(
			context.headers,
			input.projectId,
			"space:read",
		);

		const states =
			(await sql`SELECT * FROM state WHERE projectId = ${input.projectId}`) as tables["state"][];

		return states;
	});
