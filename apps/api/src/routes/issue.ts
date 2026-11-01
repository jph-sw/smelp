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

const Title = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120));
const Description = v.pipe(v.string(), v.maxLength(20_000));

async function requireAssigneeInProject(
	assignee: string,
	project: tables["project"],
) {
	const member = (
		await sql`SELECT id FROM auth_space_member WHERE spaceId = ${project.spaceId} AND userId = ${assignee}`
	)[0];
	if (!member) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Work items can only be assigned to project members",
		});
	}
}

export const findIssue = base
	.input(v.object({ issueId: v.string() }))
	.handler(async ({ input, context }) => {
		await requireSession(context.headers);

		const issue = (
			await sql`
				SELECT
					issue.*,
					creator.displayName AS createdByName,
					updater.displayName AS updatedByName
				FROM issue
				LEFT JOIN auth_user creator ON creator.id = issue.createdBy
				LEFT JOIN auth_user updater ON updater.id = issue.updatedBy
				WHERE issue.id = ${input.issueId}
			`
		)[0] as
			| (tables["issue"] & {
					createdByName: string | null;
					updatedByName: string | null;
			  })
			| undefined;
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
			state: v.optional(v.string()),
			title: v.optional(Title),
			description: v.optional(Description),
			assignee: v.optional(v.nullable(v.string())),
		}),
	)
	.handler(async ({ input, context }) => {
		const session = await requireSession(context.headers);

		const oldIssue = (
			await sql`SELECT * FROM issue WHERE id = ${input.id}`
		)[0] as tables["issue"] | undefined;
		if (!oldIssue) throw new ORPCError("NOT_FOUND");

		const { project } = await requireProjectPermission(
			context.headers,
			oldIssue.projectId,
			"content:write",
		);

		const next = {
			state: input.state ?? oldIssue.state,
			title: input.title ?? oldIssue.title,
			description: input.description ?? oldIssue.description,
			assignee:
				input.assignee === undefined ? oldIssue.assignee : input.assignee,
		};

		const stateChanged = next.state !== oldIssue.state;
		const titleChanged = next.title !== oldIssue.title;
		const descriptionChanged = next.description !== oldIssue.description;
		const assigneeChanged = next.assignee !== oldIssue.assignee;

		if (
			!stateChanged &&
			!titleChanged &&
			!descriptionChanged &&
			!assigneeChanged
		) {
			return oldIssue;
		}

		if (stateChanged) await requireStateInProject(next.state, project.id);
		if (assigneeChanged && next.assignee) {
			await requireAssigneeInProject(next.assignee, project);
		}

		await sql`
			UPDATE issue SET
				state = ${next.state},
				title = ${next.title},
				description = ${next.description},
				assignee = ${next.assignee},
				updatedAt = ${Date.now()},
				updatedBy = ${session.userId}
			WHERE id = ${input.id}
		`;

		const issue = (
			await sql`SELECT * FROM issue WHERE id = ${input.id}`
		)[0] as tables["issue"];

		const event = {
			entityId: issue.id,
			workspaceId: issue.workspaceId,
			actorId: session.userId,
		};
		if (stateChanged) {
			eventBus.emit({
				...event,
				type: "issue.status_changed",
				payload: {
					field: "status",
					oldValue: oldIssue.state,
					newValue: issue.state,
				},
			});
		}
		if (titleChanged) {
			eventBus.emit({
				...event,
				type: "issue.updated",
				payload: {
					field: "title",
					oldValue: oldIssue.title,
					newValue: issue.title,
				},
			});
		}
		if (descriptionChanged) {
			// Descriptions can be long, so the log only records that one changed.
			eventBus.emit({
				...event,
				type: "issue.updated",
				payload: { field: "description", oldValue: null, newValue: null },
			});
		}
		if (assigneeChanged) {
			eventBus.emit({
				...event,
				type: "issue.assigned",
				payload: {
					field: "assignee",
					oldValue: oldIssue.assignee,
					newValue: issue.assignee,
				},
			});
		}

		return issue;
	});

export const deleteIssue = base
	.input(v.object({ id: v.string() }))
	.handler(async ({ input, context }) => {
		const session = await requireSession(context.headers);

		const issue = (await sql`SELECT * FROM issue WHERE id = ${input.id}`)[0] as
			| tables["issue"]
			| undefined;
		if (!issue) throw new ORPCError("NOT_FOUND");

		await requireProjectPermission(
			context.headers,
			issue.projectId,
			"content:write",
		);

		await sql`DELETE FROM issue WHERE id = ${issue.id}`;

		eventBus.emit({
			type: "issue.deleted",
			entityId: issue.id,
			workspaceId: issue.workspaceId,
			actorId: session.userId,
			payload: { title: issue.title, projectId: issue.projectId },
		});

		return { id: issue.id };
	});

export const createIssue = base
	.input(
		v.object({
			title: Title,
			description: Description,
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
		if (input.assignee) {
			await requireAssigneeInProject(input.assignee, project);
		}

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
			createdBy: session.userId,
			updatedBy: session.userId,
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
