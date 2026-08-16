import { ORPCError } from "@orpc/server";
import { getCookie } from "@orpc/server/helpers";
import { Auth } from "@smelp/auth";
import { DB, type tables } from "@smelp/db";
import { SQL } from "bun";
import * as v from "valibot";
import { base } from "../orpc";

const sql = new DB().sqlite;
const auth = new Auth();

export const findIssue = base
	.input(v.object({ id: v.string() }))
	.handler(async ({ input }) => {
		const issue = (
			await sql`SELECT * FROM issue WHERE id = ${input.id}`
		)[0] as tables["issue"];

		return issue;
	});

export const createIssue = base
	.input(
		v.object({
			description: v.string(),
			state: v.string(),
			type: v.string(),
			assignee: v.optional(v.string()),
			parentId: v.optional(v.string()),
			workspaceId: v.string(),
			projectId: v.string(),
		}),
	)
	.handler(async ({ input, context }) => {
		const token = getCookie(context.headers, "auth_session");
		if (!token) throw new ORPCError("UNAUTHORIZED");

		const session = await auth.validateAuthSessionToken(token);
		if (!session) throw new ORPCError("UNAUTHORIZED");

		const project: tables["issue"] = {
			id: "",
			assignee: input.assignee || null,
			state: input.state,
			description: input.description,
			type: input.type,
			parentId: input.parentId || null,
			workspaceId: input.workspaceId,
			projectId: input.projectId,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		};

		try {
			await sql`INSERT INTO project ${sql(project)}`;
		} catch (e) {
			if (e instanceof SQL.SQLiteError) {
				if (e.code === "SQLITE_CONSTRAINT_PRIMARYKEY") {
					throw new ORPCError("CONFLICT", {
						message: "A project with this name already exists",
					});
				}
			}
		}

		return project;
	});
