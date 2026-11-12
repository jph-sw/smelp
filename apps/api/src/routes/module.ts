import { ORPCError } from "@orpc/server";
import { DB, type tables } from "@smelp/db";
import { eventBus, type ModuleChange } from "@smelp/events";
import { SQL } from "bun";
import * as v from "valibot";
import { requireProjectPermission, requireSession } from "../lib/access";
import { base } from "../orpc";

const sql = new DB().sqlite;

const Name = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(80));
const Description = v.pipe(v.string(), v.maxLength(2_000));
// An empty id would be stored as-is and skip the checks that guard real ones.
const NonEmpty = v.pipe(v.string(), v.minLength(1));
const TargetDate = v.pipe(
	v.string(),
	v.regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-12-31"),
	v.check((value) => {
		const date = new Date(`${value}T00:00:00Z`);
		return (
			!Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
		);
	}, "That isn't a real date"),
);

export type ModuleWithProgress = Pick<
	tables["module"],
	| "id"
	| "projectId"
	| "name"
	| "description"
	| "leadId"
	| "targetDate"
	| "createdAt"
> & {
	leadName: string | null;
	progress: {
		total: number;
		done: number;
		inProgress: number;
		notStarted: number;
		cancelled: number;
	};
};

type ModuleRow = Omit<ModuleWithProgress, "progress"> & {
	total: number;
	done: number;
	inProgress: number;
	cancelled: number;
};

// Cancelled items are counted apart: they are neither work left nor work done.
// Anything that isn't done, started or cancelled hasn't been started. The lead
// only shows while they are still a member of the project.
async function loadModules(
	projectId: string,
	moduleId: string | null,
): Promise<ModuleWithProgress[]> {
	const rows = (await sql`
		SELECT
			module.id, module.projectId, module.name, module.description,
			module.targetDate, module.createdAt,
			CASE WHEN lead_member.userId IS NOT NULL THEN module.leadId END AS leadId,
			CASE WHEN lead_member.userId IS NOT NULL THEN lead.displayName END AS leadName,
			COUNT(issue.id) AS total,
			COUNT(CASE WHEN state."group" = 'completed' THEN 1 END) AS done,
			COUNT(CASE WHEN state."group" = 'started' THEN 1 END) AS inProgress,
			COUNT(CASE WHEN state."group" = 'cancelled' THEN 1 END) AS cancelled
		FROM module
		JOIN project ON project.id = module.projectId
		LEFT JOIN auth_space_member lead_member
			ON lead_member.spaceId = project.spaceId AND lead_member.userId = module.leadId
		LEFT JOIN auth_user lead ON lead.id = module.leadId
		LEFT JOIN issue ON issue.moduleId = module.id
		LEFT JOIN state ON state.id = issue.state
		WHERE module.projectId = ${projectId}
			AND (${moduleId} IS NULL OR module.id = ${moduleId})
		GROUP BY module.id
		ORDER BY module.createdAt, module.rowid
	`) as ModuleRow[];

	return rows.map(({ total, done, inProgress, cancelled, ...rest }) => ({
		...rest,
		progress: {
			total,
			done,
			inProgress,
			cancelled,
			notStarted: total - done - inProgress - cancelled,
		},
	}));
}

async function loadModule(projectId: string, moduleId: string) {
	const [loaded] = await loadModules(projectId, moduleId);
	if (!loaded) throw new ORPCError("NOT_FOUND");
	return loaded;
}

// Asking about a project or module the caller can't read looks the same as asking
// about one that doesn't exist, so private projects don't give themselves away.
async function requireReadableProject(headers: Headers, projectId: string) {
	try {
		return await requireProjectPermission(headers, projectId, "space:read");
	} catch (error) {
		if (error instanceof ORPCError && error.code === "FORBIDDEN") {
			throw new ORPCError("NOT_FOUND");
		}
		throw error;
	}
}

async function requireModule(headers: Headers, moduleId: string) {
	await requireSession(headers);
	const found = (await sql`SELECT * FROM module WHERE id = ${moduleId}`)[0] as
		| tables["module"]
		| undefined;
	if (!found) throw new ORPCError("NOT_FOUND");
	await requireReadableProject(headers, found.projectId);
	return found;
}

// Same rule as the project's states: it takes someone who can update the project.
async function requireManageableModule(headers: Headers, moduleId: string) {
	const found = await requireModule(headers, moduleId);
	const { session, project } = await requireProjectPermission(
		headers,
		found.projectId,
		"space:update",
	);
	return { module: found, session, project };
}

const eventBase = (
	session: { userId: string },
	project: tables["project"],
	entityId: string,
) => ({
	workspaceId: project.workspaceId,
	actorId: session.userId,
	entityId,
});

const duplicateName = () =>
	new ORPCError("CONFLICT", {
		message: "A module with this name already exists in the project",
	});

const notAMember = () =>
	new ORPCError("BAD_REQUEST", {
		message: "The lead must be a member of the project",
	});

export const findModules = base
	.input(v.object({ projectId: v.string() }))
	.handler(async ({ input, context }) => {
		await requireSession(context.headers);
		await requireReadableProject(context.headers, input.projectId);
		return loadModules(input.projectId, null);
	});

export const findModule = base
	.input(v.object({ id: v.string() }))
	.handler(async ({ input, context }) => {
		const found = await requireModule(context.headers, input.id);
		return loadModule(found.projectId, found.id);
	});

export const createModule = base
	.input(
		v.object({
			projectId: NonEmpty,
			name: Name,
			description: v.optional(Description, ""),
			leadId: v.optional(v.nullable(NonEmpty)),
			targetDate: v.optional(v.nullable(TargetDate)),
		}),
	)
	.handler(async ({ input, context }) => {
		await requireSession(context.headers);
		await requireReadableProject(context.headers, input.projectId);
		const { session, project } = await requireProjectPermission(
			context.headers,
			input.projectId,
			"space:update",
		);

		const id = crypto.randomUUID();
		const leadId = input.leadId ?? null;
		// The lead check is part of the insert, so a member removed in between can't
		// be set as the lead.
		let written: unknown[];
		try {
			written = await sql`
				INSERT INTO module (id, projectId, name, description, leadId, targetDate, createdAt, createdBy)
				SELECT ${id}, ${project.id}, ${input.name}, ${input.description},
					${leadId}, ${input.targetDate ?? null}, ${Date.now()}, ${session.userId}
				WHERE ${leadId} IS NULL OR EXISTS (
					SELECT 1 FROM auth_space_member
					WHERE spaceId = ${project.spaceId} AND userId = ${leadId}
				)
				RETURNING id
			`;
		} catch (error) {
			if (
				error instanceof SQL.SQLiteError &&
				error.code === "SQLITE_CONSTRAINT_UNIQUE"
			) {
				throw duplicateName();
			}
			throw error;
		}
		if (written.length === 0) throw notAMember();

		eventBus.emit({
			...eventBase(session, project, id),
			type: "module.created",
			payload: {
				projectId: project.id,
				projectName: project.name,
				name: input.name,
			},
		});

		return loadModule(project.id, id);
	});

export const updateModule = base
	.input(
		v.object({
			id: NonEmpty,
			name: v.optional(Name),
			description: v.optional(Description),
			leadId: v.optional(v.nullable(NonEmpty)),
			targetDate: v.optional(v.nullable(TargetDate)),
		}),
	)
	.handler(async ({ input, context }) => {
		const {
			module: old,
			session,
			project,
		} = await requireManageableModule(context.headers, input.id);

		const next = {
			name: input.name ?? old.name,
			description: input.description ?? old.description,
			leadId: input.leadId === undefined ? old.leadId : input.leadId,
			targetDate:
				input.targetDate === undefined ? old.targetDate : input.targetDate,
		};
		const changes: ModuleChange[] = [];
		if (next.name !== old.name) changes.push("name");
		if (next.description !== old.description) changes.push("description");
		if (next.leadId !== old.leadId) changes.push("lead");
		if (next.targetDate !== old.targetDate) changes.push("targetDate");
		if (changes.length === 0) {
			return loadModule(project.id, old.id);
		}

		// Only a changed lead is checked, so an unrelated edit still works after the
		// lead has left the project. The check is part of the write.
		// Each column is only written when this request changes it, so a concurrent
		// edit of another field isn't overwritten with a stale value.
		const setLead = changes.includes("lead") ? 1 : 0;
		const flag = (change: ModuleChange) => (changes.includes(change) ? 1 : 0);
		let written: unknown[];
		try {
			written = await sql`
				UPDATE module SET
					name = CASE WHEN ${flag("name")} = 1 THEN ${next.name} ELSE name END,
					description = CASE WHEN ${flag("description")} = 1 THEN ${next.description} ELSE description END,
					leadId = CASE WHEN ${setLead} = 1 THEN ${next.leadId} ELSE leadId END,
					targetDate = CASE WHEN ${flag("targetDate")} = 1 THEN ${next.targetDate} ELSE targetDate END
				WHERE id = ${old.id}
					AND (
						${setLead} = 0
						OR ${next.leadId} IS NULL
						OR EXISTS (
							SELECT 1 FROM auth_space_member
							WHERE spaceId = ${project.spaceId} AND userId = ${next.leadId}
						)
					)
				RETURNING id
			`;
		} catch (error) {
			if (
				error instanceof SQL.SQLiteError &&
				error.code === "SQLITE_CONSTRAINT_UNIQUE"
			) {
				throw duplicateName();
			}
			throw error;
		}
		if (written.length === 0) {
			const stillThere = await sql`SELECT id FROM module WHERE id = ${old.id}`;
			if (stillThere.length === 0) throw new ORPCError("NOT_FOUND");
			throw notAMember();
		}

		eventBus.emit({
			...eventBase(session, project, old.id),
			type: "module.updated",
			payload: {
				projectId: project.id,
				projectName: project.name,
				name: next.name,
				oldName: old.name,
				changes,
			},
		});

		return loadModule(project.id, old.id);
	});

export const deleteModule = base
	.input(v.object({ id: NonEmpty }))
	.handler(async ({ input, context }) => {
		const {
			module: old,
			session,
			project,
		} = await requireManageableModule(context.headers, input.id);

		// The work items stay, without a module, rather than pointing at one that's gone.
		const result = await sql.begin(async (tx) => {
			const items = (await tx`
				SELECT id, title FROM issue WHERE moduleId = ${old.id}
			`) as Pick<tables["issue"], "id" | "title">[];
			await tx`
				UPDATE issue SET
					moduleId = NULL,
					updatedAt = ${Date.now()},
					updatedBy = ${session.userId}
				WHERE moduleId = ${old.id}
			`;
			const deleted =
				await tx`DELETE FROM module WHERE id = ${old.id} RETURNING id`;
			return { items, deleted: deleted.length > 0 };
		});
		if (!result.deleted) throw new ORPCError("NOT_FOUND");

		for (const item of result.items) {
			eventBus.emit({
				...eventBase(session, project, item.id),
				type: "issue.updated",
				payload: {
					projectId: project.id,
					title: item.title,
					field: "module",
					oldValue: old.name,
					newValue: null,
				},
			});
		}
		eventBus.emit({
			...eventBase(session, project, old.id),
			type: "module.deleted",
			payload: {
				projectId: project.id,
				projectName: project.name,
				name: old.name,
			},
		});

		return { id: old.id };
	});
