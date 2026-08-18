import { ORPCError } from "@orpc/server";
import { getCookie } from "@orpc/server/helpers";
import { Auth } from "@smelp/auth";
import { DB, type tables } from "@smelp/db";
import { eventBus } from "@smelp/events";
import { SQL } from "bun";
import * as v from "valibot";
import { base } from "../orpc";

const sql = new DB().sqlite;
const auth = new Auth();

export const findIssue = base
	.input(v.object({ issueId: v.string() }))
	.handler(async ({ input }) => {
		const issue = (
			await sql`SELECT * FROM issue WHERE id = ${input.issueId}`
		)[0] as tables["issue"];

		return issue;
	});

export const updateIssue = base
	.input(
		v.object({
			id: v.string(),
			state: v.string(),
		}),
	)
	.handler(async ({ input, context }) => {
		const token = getCookie(context.headers, "auth_session");
		if (!token) throw new ORPCError("UNAUTHORIZED");

		const session = await auth.validateAuthSessionToken(token);
		if (!session) throw new ORPCError("UNAUTHORIZED");

		const oldIssue = (
			await sql`SELECT * FROM issue WHERE id = ${input.id}`
		)[0] as tables["issue"];

		await sql`UPDATE issue SET state = ${input.state}, updatedAt = ${Date.now()} WHERE id = ${input.id}`;

		const issue = (
			await sql`SELECT * FROM issue WHERE id = ${input.id}`
		)[0] as tables["issue"];

		eventBus.emit({
			type: "issue.status_changed",
			entityId: issue.id,
			workspaceId: issue.workspaceId,
			actorId: session.userId,
			payload: {
				field: "status",
				oldValue: oldIssue.state,
				newValue: issue.state,
			},
		});

		return issue;
	});

export const createIssue = base
	.input(
		v.object({
			title: v.string(),
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

		console.log("creating, ", input);

		const project_counter = (
			await sql`SELECT * FROM project_counter WHERE projectId = ${input.projectId}`
		)[0] as tables["project_counter"];

		const project = (
			await sql`SELECT * FROM project WHERE id = ${input.projectId}`
		)[0] as tables["project"];

		console.log(JSON.stringify(project_counter));

		const issue: tables["issue"] = {
			id: `${project.id}-${project_counter.lastNumber + 1}`,
			assignee: input.assignee || null,
			state: input.state,
			title: input.title,
			description: input.description,
			type: input.type,
			parentId: input.parentId || null,
			workspaceId: input.workspaceId,
			projectId: input.projectId,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		};

		try {
			await sql`INSERT INTO issue ${sql(issue)}`;
		} catch (e) {
			if (e instanceof SQL.SQLiteError) {
				if (e.code === "SQLITE_CONSTRAINT_PRIMARYKEY") {
					throw new ORPCError("CONFLICT", {
						message: "An issue with this name already exists",
					});
				}
			}
		}

		await sql`UPDATE project_counter SET lastNumber = lastNumber + 1 WHERE projectId = ${project.id}`;

		eventBus.emit({
			type: "issue.created",
			entityId: issue.id,
			actorId: session.userId,
			workspaceId: issue.workspaceId,
			payload: { title: issue.title, projectId: issue.projectId },
		});

		return issue;
	});
