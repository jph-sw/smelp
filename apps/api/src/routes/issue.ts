import { ORPCError } from "@orpc/server";
import { DB, type tables } from "@smelp/db";
import { eventBus } from "@smelp/events";
import { SQL } from "bun";
import * as v from "valibot";
import { requireProjectPermission, requireSession } from "../lib/access";
import { base } from "../orpc";

const sql = new DB().sqlite;

async function requireStateInProject(stateId: string, projectId: string) {
	const state = (
		await sql`SELECT id FROM state WHERE id = ${stateId} AND projectId = ${projectId}`
	)[0];
	if (!state) {
		throw new ORPCError("BAD_REQUEST", {
			message: "This state doesn't belong to the project",
		});
	}
}

export const findIssue = base
	.input(v.object({ issueId: v.string() }))
	.handler(async ({ input, context }) => {
		const issue = (
			await sql`SELECT * FROM issue WHERE id = ${input.issueId}`
		)[0] as tables["issue"] | undefined;

		// Check the session first so signed-out callers can't probe which ids exist.
		await requireSession(context.headers);
		if (!issue) throw new ORPCError("NOT_FOUND");

		await requireProjectPermission(
			context.headers,
			issue.projectId,
			"space:read",
		);

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
		const session = await requireSession(context.headers);

		const oldIssue = (
			await sql`SELECT * FROM issue WHERE id = ${input.id}`
		)[0] as tables["issue"] | undefined;
		if (!oldIssue) throw new ORPCError("NOT_FOUND");

		await requireProjectPermission(
			context.headers,
			oldIssue.projectId,
			"content:write",
		);
		await requireStateInProject(input.state, oldIssue.projectId);

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
		const { session, project } = await requireProjectPermission(
			context.headers,
			input.projectId,
			"content:write",
		);
		await requireStateInProject(input.state, project.id);

		const project_counter = (
			await sql`SELECT * FROM project_counter WHERE projectId = ${input.projectId}`
		)[0] as tables["project_counter"];

		const issue: tables["issue"] = {
			id: `${project.id}-${project_counter.lastNumber + 1}`,
			assignee: input.assignee || null,
			state: input.state,
			title: input.title,
			description: input.description,
			type: input.type,
			parentId: input.parentId || null,
			workspaceId: project.workspaceId,
			projectId: project.id,
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
			throw e;
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
