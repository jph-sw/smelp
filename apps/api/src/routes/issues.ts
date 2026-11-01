import { DB, type tables } from "@smelp/db";
import * as v from "valibot";
import { requireProjectPermission } from "../lib/access";
import { base } from "../orpc";

const sql = new DB().sqlite;

export const findIssues = base
	.input(v.object({ projectId: v.string() }))
	.handler(async ({ input, context }) => {
		await requireProjectPermission(
			context.headers,
			input.projectId,
			"space:read",
		);

		const issues =
			(await sql`SELECT * FROM issue WHERE projectId = ${input.projectId} ORDER BY updatedAt DESC`) as tables["issue"][];

		return issues;
	});
