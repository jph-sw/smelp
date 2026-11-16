import { ORPCError } from "@orpc/server";
import { Auth } from "@smelp/auth";
import { DB, type tables } from "@smelp/db";
import { eventBus, type ProjectChange } from "@smelp/events";
import { SQL } from "bun";
import * as v from "valibot";
import {
	requireNotArchived,
	requireProjectPermission,
	requireUser,
	requireWorkspacePermission,
} from "../lib/access";
import {
	attachmentKeysOfProject,
	removeAttachmentFiles,
} from "../lib/attachments";
import { detectImageType } from "../lib/avatars";
import { MAX_BACKGROUND_BYTES } from "../lib/project-backgrounds";
import { base } from "../orpc";

const sql = new DB().sqlite;
const auth = new Auth();

export const createProject = base
	.input(
		v.object({
			id: v.pipe(v.string(), v.minLength(2), v.maxLength(5)),
			name: v.pipe(v.string(), v.trim(), v.minLength(2), v.maxLength(32)),
			description: v.string(),
			access: v.picklist(["public", "private"]),
			icon: v.string(),
			workspaceId: v.string(),
		}),
	)
	.handler(async ({ input, context }) => {
		const { caller } = await requireWorkspacePermission(
			context.headers,
			input.workspaceId,
			"content:write",
		);

		const now = Date.now();

		const auth_space: tables["auth_space"] = {
			id: input.id,
			name: input.name,
			ownerId: caller.userId,
			createdAt: now,
			updatedAt: now,
		};

		const auth_space_member: tables["auth_space_member"] = {
			id: crypto.randomUUID(),
			spaceId: auth_space.id,
			userId: caller.userId,
			role: "admin",
			createdAt: now,
		};

		const project: tables["project"] = {
			id: input.id,
			name: input.name,
			description: input.description,
			access: input.access,
			leadUserId: null,
			defaultAssigneeUserId: null,
			workspaceId: input.workspaceId,
			spaceId: auth_space.id,
			image: null,
			icon: input.icon,
			createdBy: caller.userId,
			createdAt: now,
			updatedAt: now,
			archivedAt: null,
			archivedBy: null,
			backgroundImage: null,
		};

		const project_counter: tables["project_counter"] = {
			projectId: project.id,
			lastNumber: 0,
		};

		const states: tables["state"][] = [
			{
				id: crypto.randomUUID(),
				value: "backlog",
				name: "Backlog",
				color: "#ffffff",
				group: "backlog",
				projectId: project.id,
				isDefault: true,
				position: 0,
			},
			{
				id: crypto.randomUUID(),
				value: "todo",
				name: "Todo",
				color: "#ffffff",
				group: "unstarted",
				projectId: project.id,
				isDefault: false,
				position: 1,
			},
			{
				id: crypto.randomUUID(),
				value: "in_progress",
				name: "In Progress",
				color: "#ffffff",
				group: "started",
				projectId: project.id,
				isDefault: false,
				position: 2,
			},
			{
				id: crypto.randomUUID(),
				value: "done",
				name: "Done",
				color: "#ffffff",
				group: "completed",
				projectId: project.id,
				isDefault: false,
				position: 3,
			},
		];

		try {
			await sql.begin(async (tx) => {
				await tx`INSERT INTO auth_space ${tx(auth_space)}`;
				await tx`INSERT INTO auth_space_member ${tx(auth_space_member)}`;
				await tx`INSERT INTO project ${tx(project)}`;
				await tx`INSERT INTO project_counter ${tx(project_counter)}`;
				await tx`INSERT INTO state ${tx(states)}`;
			});
		} catch (e) {
			if (e instanceof SQL.SQLiteError) {
				if (e.code === "SQLITE_CONSTRAINT_PRIMARYKEY") {
					throw new ORPCError("CONFLICT", {
						message: "A project with this name already exists",
					});
				}
			}
			throw e;
		}

		eventBus.emit({
			type: "project.created",
			workspaceId: input.workspaceId,
			entityId: project.id,
			actorId: caller.userId,
			payload: { projectId: project.id, name: project.name },
		});

		return project;
	});

export const findProject = base
	.input(v.object({ projectId: v.string() }))
	.handler(async ({ input, context }) => {
		const { project } = await requireProjectPermission(
			context.headers,
			input.projectId,
			"space:read",
			{ public: true },
		);
		return project;
	});

export const updateProject = base
	.input(
		v.object({
			projectId: v.string(),
			name: v.optional(
				v.pipe(v.string(), v.trim(), v.minLength(2), v.maxLength(32)),
			),
			description: v.optional(v.pipe(v.string(), v.maxLength(2000))),
			icon: v.optional(v.string()),
			access: v.optional(v.picklist(["public", "private"])),
		}),
	)
	.handler(async ({ input, context }) => {
		const { caller, project } = await requireProjectPermission(
			context.headers,
			input.projectId,
			"space:update",
		);

		const next = {
			name: input.name ?? project.name,
			description: input.description ?? project.description,
			icon: input.icon ?? project.icon,
			access: input.access ?? project.access,
		};
		const changes = (Object.keys(next) as ProjectChange[]).filter(
			(key) => next[key] !== project[key],
		);
		if (changes.length === 0) return project;

		await sql`
			UPDATE project SET
				name = ${next.name},
				description = ${next.description},
				icon = ${next.icon},
				access = ${next.access},
				updatedAt = ${Date.now()}
			WHERE id = ${project.id}
		`;

		eventBus.emit({
			type: "project.updated",
			workspaceId: project.workspaceId,
			actorId: caller.userId,
			entityId: project.id,
			payload: {
				projectId: project.id,
				name: next.name,
				oldName: project.name,
				access: next.access,
				changes,
			},
		});

		return (
			await sql`SELECT * FROM project WHERE id = ${project.id}`
		)[0] as tables["project"];
	});

export const deleteProject = base
	.input(v.object({ projectId: v.string() }))
	.handler(async ({ input, context }) => {
		const caller = await requireUser(context.headers);

		const project = (
			await sql`SELECT * FROM project WHERE id = ${input.projectId}`
		)[0] as tables["project"];

		if (!project) {
			throw new ORPCError("NOT_FOUND");
		}

		const allowed = await auth.userHasPermission(
			caller.userId,
			project.spaceId,
			"space:delete",
		);
		if (!allowed) {
			throw new ORPCError("FORBIDDEN");
		}

		const members = (await sql`
			SELECT userId FROM auth_space_member WHERE spaceId = ${project.spaceId}
		`) as Pick<tables["auth_space_member"], "userId">[];

		// deleting the space cascades to project, issue, state, project_counter,
		// auth_space_member, and auth_space_invite
		const files = await attachmentKeysOfProject(project.id);
		await sql`DELETE FROM auth_space WHERE id = ${project.spaceId}`;
		await removeAttachmentFiles(files);

		eventBus.emit({
			type: "project.deleted",
			workspaceId: project.workspaceId,
			actorId: caller.userId,
			entityId: project.id,
			payload: {
				projectId: project.id,
				name: project.name,
				access: project.access,
				memberIds: members.map((member) => member.userId),
			},
		});

		return { success: true };
	});

export const joinProject = base
	.input(v.object({ projectId: v.string() }))
	.handler(async ({ input, context }) => {
		const caller = await requireUser(context.headers);

		const project = (
			await sql`SELECT * FROM project WHERE id = ${input.projectId}`
		)[0] as tables["project"];

		if (!project) {
			throw new ORPCError("NOT_FOUND");
		}

		// Joining makes you a project member, so workspace guests can't do it themselves.
		await requireWorkspacePermission(
			context.headers,
			project.workspaceId,
			"content:write",
		);

		requireNotArchived(project);

		if (project.access !== "public") {
			throw new ORPCError("FORBIDDEN", {
				message: "This project is private. Ask a member to invite you.",
			});
		}

		const member: tables["auth_space_member"] = {
			id: crypto.randomUUID(),
			spaceId: project.spaceId,
			userId: caller.userId,
			role: "member",
			createdAt: Date.now(),
		};

		try {
			await sql`INSERT INTO auth_space_member ${sql(member)}`;
		} catch (e) {
			if (e instanceof SQL.SQLiteError) {
				if (e.code === "SQLITE_CONSTRAINT_UNIQUE") {
					throw new ORPCError("CONFLICT", {
						message: "You are already a member of this project",
					});
				}
			}
			throw e;
		}

		return member;
	});

// Archiving needs the same right as deleting: it takes the project out of
// everyone's way, and only an admin can undo it.
function setArchived(archived: boolean) {
	return base
		.input(v.object({ projectId: v.string() }))
		.handler(async ({ input, context }) => {
			const { caller, project } = await requireProjectPermission(
				context.headers,
				input.projectId,
				"space:delete",
				{ allowArchived: true },
			);

			if ((project.archivedAt !== null) === archived) {
				throw new ORPCError("CONFLICT", {
					message: archived
						? "This project is already archived"
						: "This project is not archived",
				});
			}

			const now = Date.now();
			await sql`
				UPDATE project SET
					archivedAt = ${archived ? now : null},
					archivedBy = ${archived ? caller.userId : null},
					updatedAt = ${now}
				WHERE id = ${project.id}
			`;

			eventBus.emit({
				type: archived ? "project.archived" : "project.unarchived",
				workspaceId: project.workspaceId,
				actorId: caller.userId,
				entityId: project.id,
				payload: {
					projectId: project.id,
					name: project.name,
					access: project.access,
				},
			});

			return (
				await sql`SELECT * FROM project WHERE id = ${project.id}`
			)[0] as tables["project"];
		});
}

export const archiveProject = setArchived(true);
export const unarchiveProject = setArchived(false);

export const setBackground = base
	.input(
		v.object({
			projectId: v.string(),
			// Base64 is 4 characters for every 3 bytes.
			image: v.pipe(
				v.string(),
				v.maxLength(Math.ceil(MAX_BACKGROUND_BYTES / 3) * 4),
			),
		}),
	)
	.handler(async ({ input, context }) => {
		const { project } = await requireProjectPermission(
			context.headers,
			input.projectId,
			"space:update",
		);

		const data = new Uint8Array(Buffer.from(input.image, "base64"));
		const contentType = detectImageType(data);
		if (!contentType) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Use a PNG, JPEG or WebP image.",
			});
		}

		const updatedAt = Date.now();
		const background: tables["project_background"] = {
			projectId: project.id,
			contentType,
			data,
			updatedAt,
		};
		const backgroundImage = `/api/project-backgrounds/${project.id}?v=${updatedAt}`;

		await sql.begin(async (tx) => {
			await tx`DELETE FROM project_background WHERE projectId = ${project.id}`;
			await tx`INSERT INTO project_background ${tx(background)}`;
			await tx`
				UPDATE project SET backgroundImage = ${backgroundImage}, updatedAt = ${updatedAt}
				WHERE id = ${project.id}
			`;
		});

		return (
			await sql`SELECT * FROM project WHERE id = ${project.id}`
		)[0] as tables["project"];
	});

export const removeBackground = base
	.input(v.object({ projectId: v.string() }))
	.handler(async ({ input, context }) => {
		const { project } = await requireProjectPermission(
			context.headers,
			input.projectId,
			"space:update",
		);

		await sql.begin(async (tx) => {
			await tx`DELETE FROM project_background WHERE projectId = ${project.id}`;
			await tx`
				UPDATE project SET backgroundImage = NULL, updatedAt = ${Date.now()}
				WHERE id = ${project.id}
			`;
		});

		return (
			await sql`SELECT * FROM project WHERE id = ${project.id}`
		)[0] as tables["project"];
	});
