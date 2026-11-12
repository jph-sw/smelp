import { ORPCError } from "@orpc/server";
import { DB, type tables } from "@smelp/db";
import { eventBus } from "@smelp/events";
import { SQL } from "bun";
import * as v from "valibot";
import { requireProjectPermission, requireSession } from "../lib/access";
import {
	attachmentKeysOfIssue,
	removeAttachmentFiles,
} from "../lib/attachments";
import { displayNameOf } from "../lib/names";
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

async function stateName(stateId: string) {
	const state = (await sql`SELECT name FROM state WHERE id = ${stateId}`)[0] as
		| Pick<tables["state"], "name">
		| undefined;
	return state?.name ?? null;
}

async function requireCycleInProject(cycleId: string, projectId: string) {
	const cycle = (
		await sql`SELECT id FROM cycle WHERE id = ${cycleId} AND projectId = ${projectId}`
	)[0];
	if (!cycle) {
		throw new ORPCError("BAD_REQUEST", {
			message: "The cycle must be in the same project",
		});
	}
}

async function cycleName(cycleId: string | null) {
	if (!cycleId) return null;
	const cycle = (await sql`SELECT name FROM cycle WHERE id = ${cycleId}`)[0] as
		| Pick<tables["cycle"], "name">
		| undefined;
	return cycle?.name ?? null;
}

// A parent must be in the same project, and an item can't sit below itself.
async function requireValidParent(
	parentId: string,
	projectId: string,
	itemId?: string,
) {
	if (parentId === itemId) {
		throw new ORPCError("BAD_REQUEST", {
			message: "A work item can't be its own parent",
		});
	}
	const parent = (
		await sql`SELECT id, projectId, parentId FROM issue WHERE id = ${parentId}`
	)[0] as Pick<tables["issue"], "id" | "projectId" | "parentId"> | undefined;
	if (!parent || parent.projectId !== projectId) {
		throw new ORPCError("BAD_REQUEST", {
			message: "The parent must be a work item in the same project",
		});
	}
	if (!itemId) return;

	// Walk up from the new parent: meeting the item means it would become its own ancestor.
	const seen = new Set<string>([parent.id]);
	let ancestor: string | null = parent.parentId;
	while (ancestor) {
		if (ancestor === itemId) {
			throw new ORPCError("BAD_REQUEST", {
				message: "A work item can't be moved below one of its own sub-items",
			});
		}
		if (seen.has(ancestor)) break;
		seen.add(ancestor);
		const next = (
			await sql`SELECT parentId FROM issue WHERE id = ${ancestor}`
		)[0] as Pick<tables["issue"], "parentId"> | undefined;
		ancestor = next?.parentId ?? null;
	}
}

async function requireModuleInProject(moduleId: string, projectId: string) {
	const found = (
		await sql`SELECT id FROM module WHERE id = ${moduleId} AND projectId = ${projectId}`
	)[0];
	if (!found) {
		throw new ORPCError("BAD_REQUEST", {
			message: "The module must belong to this project",
		});
	}
}

async function moduleName(moduleId: string | null) {
	if (!moduleId) return null;
	const found = (
		await sql`SELECT name FROM module WHERE id = ${moduleId}`
	)[0] as Pick<tables["module"], "name"> | undefined;
	return found?.name ?? null;
}

// An empty id would be stored as-is and skip the checks that guard real ones.
const NonEmpty = v.pipe(v.string(), v.minLength(1));
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
			assignee: v.optional(v.nullable(NonEmpty)),
			parentId: v.optional(v.nullable(NonEmpty)),
			moduleId: v.optional(v.nullable(NonEmpty)),
			cycleId: v.optional(v.nullable(NonEmpty)),
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
			parentId:
				input.parentId === undefined ? oldIssue.parentId : input.parentId,
			moduleId:
				input.moduleId === undefined ? oldIssue.moduleId : input.moduleId,
			cycleId: input.cycleId === undefined ? oldIssue.cycleId : input.cycleId,
		};

		const stateChanged = next.state !== oldIssue.state;
		const titleChanged = next.title !== oldIssue.title;
		const descriptionChanged = next.description !== oldIssue.description;
		const assigneeChanged = next.assignee !== oldIssue.assignee;
		const parentChanged = next.parentId !== oldIssue.parentId;
		const moduleChanged = next.moduleId !== oldIssue.moduleId;
		const cycleChanged = next.cycleId !== oldIssue.cycleId;

		if (
			!stateChanged &&
			!titleChanged &&
			!descriptionChanged &&
			!assigneeChanged &&
			!parentChanged &&
			!moduleChanged &&
			!cycleChanged
		) {
			return oldIssue;
		}

		if (stateChanged) await requireStateInProject(next.state, project.id);
		if (assigneeChanged && next.assignee) {
			await requireAssigneeInProject(next.assignee, project);
		}
		if (parentChanged && next.parentId) {
			await requireValidParent(next.parentId, project.id, oldIssue.id);
		}

		if (moduleChanged && next.moduleId) {
			await requireModuleInProject(next.moduleId, project.id);
		}

		if (cycleChanged && next.cycleId) {
			await requireCycleInProject(next.cycleId, project.id);
		}

		// Read before the write, so the log names what was validated even if the
		// cycle is renamed or deleted a moment later.
		const oldCycleName = cycleChanged
			? await cycleName(oldIssue.cycleId)
			: null;
		const newCycleName = cycleChanged ? await cycleName(next.cycleId) : null;

		// The parent checks run again inside this one statement, so a concurrent move or
		// delete can't slip in between the checks above and the write: the new parent must
		// still exist in this project and must not have this item among its ancestors.
		// Only a real parent change is written and checked, so an item whose parent is gone
		// can still be edited, and an unrelated edit never fails over its parent.
		// The module is checked the same way: it must still exist in this project.
		const setParent = parentChanged ? 1 : 0;
		const setModule = moduleChanged ? 1 : 0;
		// Same for the cycle: it must still exist in this project when the write happens.
		const setCycle = cycleChanged ? 1 : 0;
		const written = await sql`
			UPDATE issue SET
				state = ${next.state},
				title = ${next.title},
				description = ${next.description},
				assignee = ${next.assignee},
				parentId = CASE WHEN ${setParent} = 1 THEN ${next.parentId} ELSE parentId END,
				moduleId = CASE WHEN ${setModule} = 1 THEN ${next.moduleId} ELSE moduleId END,
				cycleId = CASE WHEN ${setCycle} = 1 THEN ${next.cycleId} ELSE cycleId END,
				updatedAt = ${Date.now()},
				updatedBy = ${session.userId}
			WHERE id = ${input.id}
				AND (
					${setModule} = 0
					OR ${next.moduleId} IS NULL
					OR EXISTS (
						SELECT 1 FROM module
						WHERE module.id = ${next.moduleId} AND module.projectId = ${project.id}
					)
				)
				AND (
					${setCycle} = 0
					OR ${next.cycleId} IS NULL
					OR EXISTS (
						SELECT 1 FROM cycle
						WHERE cycle.id = ${next.cycleId} AND cycle.projectId = ${project.id}
					)
				)
				AND (
					${setParent} = 0
					OR ${next.parentId} IS NULL
					OR (
						EXISTS (
							SELECT 1 FROM issue AS p
							WHERE p.id = ${next.parentId} AND p.projectId = ${project.id}
						)
						AND NOT EXISTS (
							WITH RECURSIVE ancestors(id) AS (
								SELECT ${next.parentId}
								UNION
								SELECT issue.parentId FROM issue
								JOIN ancestors ON issue.id = ancestors.id
								WHERE issue.parentId IS NOT NULL
							)
							SELECT 1 FROM ancestors WHERE id = ${input.id}
						)
					)
				)
			RETURNING id
		`;
		if (written.length === 0) {
			const stillThere = await sql`SELECT id FROM issue WHERE id = ${input.id}`;
			if (stillThere.length === 0) throw new ORPCError("NOT_FOUND");
			if (moduleChanged && next.moduleId) {
				const moduleStillThere = await sql`
					SELECT id FROM module WHERE id = ${next.moduleId} AND projectId = ${project.id}
				`;
				if (moduleStillThere.length === 0) {
					throw new ORPCError("BAD_REQUEST", {
						message: "The module must belong to this project",
					});
				}
			}
			// Say which check failed, so the message fits what the caller changed.
			throw new ORPCError("BAD_REQUEST", {
				message:
					cycleChanged && !parentChanged
						? "The cycle must be in the same project"
						: "The parent must be a work item in the same project, and not below this one",
			});
		}

		const issue = (
			await sql`SELECT * FROM issue WHERE id = ${input.id}`
		)[0] as tables["issue"];

		const event = {
			entityId: issue.id,
			workspaceId: issue.workspaceId,
			actorId: session.userId,
		};
		const ref = { projectId: issue.projectId, title: issue.title };
		if (stateChanged) {
			eventBus.emit({
				...event,
				type: "issue.status_changed",
				payload: {
					...ref,
					field: "status",
					oldValue: oldIssue.state,
					newValue: issue.state,
					oldName: await stateName(oldIssue.state),
					newName: await stateName(issue.state),
				},
			});
		}
		if (titleChanged) {
			eventBus.emit({
				...event,
				type: "issue.updated",
				payload: {
					...ref,
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
				payload: {
					...ref,
					field: "description",
					oldValue: null,
					newValue: null,
				},
			});
		}
		if (assigneeChanged) {
			eventBus.emit({
				...event,
				type: "issue.assigned",
				payload: {
					...ref,
					field: "assignee",
					oldValue: oldIssue.assignee,
					newValue: issue.assignee,
					oldName: await displayNameOf(oldIssue.assignee),
					newName: await displayNameOf(issue.assignee),
				},
			});
		}

		if (parentChanged) {
			eventBus.emit({
				...event,
				type: "issue.updated",
				payload: {
					...ref,
					field: "parent",
					oldValue: oldIssue.parentId,
					newValue: issue.parentId,
				},
			});
		}

		if (moduleChanged) {
			// Logs the module's name, so the entry still reads well after it is deleted.
			eventBus.emit({
				...event,
				type: "issue.updated",
				payload: {
					...ref,
					field: "module",
					oldValue: await moduleName(oldIssue.moduleId),
					newValue: await moduleName(issue.moduleId),
				},
			});
		}

		if (cycleChanged) {
			eventBus.emit({
				...event,
				type: "issue.updated",
				payload: {
					...ref,
					field: "cycle",
					oldValue: oldCycleName,
					newValue: newCycleName,
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

		const files = await attachmentKeysOfIssue(issue.id);
		// Sub-items stay, as top-level items, rather than pointing at something gone.
		const detached = await sql.begin(async (tx) => {
			const children = (await tx`
				SELECT id, title FROM issue WHERE parentId = ${issue.id}
			`) as Pick<tables["issue"], "id" | "title">[];
			await tx`
				UPDATE issue SET
					parentId = NULL,
					updatedAt = ${Date.now()},
					updatedBy = ${session.userId}
				WHERE parentId = ${issue.id}
			`;
			await tx`DELETE FROM issue WHERE id = ${issue.id}`;
			return children;
		});
		await removeAttachmentFiles(files);
		for (const child of detached) {
			eventBus.emit({
				type: "issue.updated",
				entityId: child.id,
				workspaceId: issue.workspaceId,
				actorId: session.userId,
				payload: {
					projectId: issue.projectId,
					title: child.title,
					field: "parent",
					oldValue: issue.id,
					newValue: null,
				},
			});
		}

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
		if (input.parentId) {
			await requireValidParent(input.parentId, project.id);
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
			moduleId: null,
			cycleId: null,
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
		if (issue.parentId) {
			eventBus.emit({
				type: "issue.updated",
				entityId: issue.id,
				actorId: session.userId,
				workspaceId: issue.workspaceId,
				payload: {
					title: issue.title,
					projectId: issue.projectId,
					field: "parent",
					oldValue: null,
					newValue: issue.parentId,
				},
			});
		}
		// Logged like an update, so the timeline shows who it was assigned to.
		if (issue.assignee) {
			eventBus.emit({
				type: "issue.assigned",
				entityId: issue.id,
				actorId: session.userId,
				workspaceId: issue.workspaceId,
				payload: {
					title: issue.title,
					projectId: issue.projectId,
					field: "assignee",
					oldValue: null,
					newValue: issue.assignee,
					oldName: null,
					newName: await displayNameOf(issue.assignee),
				},
			});
		}

		return issue;
	});
