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
		const token = getCookie(context.headers, "auth_session");
		if (!token) throw new ORPCError("UNAUTHORIZED");

		const session = await auth.validateAuthSessionToken(token);
		if (!session) throw new ORPCError("UNAUTHORIZED");

		const now = Date.now();

		const auth_space: tables["auth_space"] = {
			id: input.id,
			name: input.name,
			ownerId: session.userId,
			createdAt: now,
			updatedAt: now,
		};

		const auth_space_member: tables["auth_space_member"] = {
			id: crypto.randomUUID(),
			spaceId: auth_space.id,
			userId: session.userId,
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
			createdBy: session.userId,
			createdAt: now,
			updatedAt: now,
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
			},
			{
				id: crypto.randomUUID(),
				value: "todo",
				name: "Todo",
				color: "#ffffff",
				group: "unstarted",
				projectId: project.id,
				isDefault: false,
			},
			{
				id: crypto.randomUUID(),
				value: "in_progress",
				name: "In Progress",
				color: "#ffffff",
				group: "started",
				projectId: project.id,
				isDefault: false,
			},
			{
				id: crypto.randomUUID(),
				value: "done",
				name: "Done",
				color: "#ffffff",
				group: "completed",
				projectId: project.id,
				isDefault: false,
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
			console.log(e);
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
			actorId: session.userId,
			payload: { name: project.name },
		});

		return project;
	});

export const findProject = base
	.input(v.object({ projectId: v.string() }))
	.handler(async ({ input, context }) => {
		const token = getCookie(context.headers, "auth_session");
		if (!token) throw new ORPCError("UNAUTHORIZED");

		const session = await auth.validateAuthSessionToken(token);
		if (!session) throw new ORPCError("UNAUTHORIZED");

		const project = (
			await sql`SELECT * FROM project WHERE id = ${input.projectId}`
		)[0] as tables["project"];

		if (!project) {
			throw new ORPCError("NOT_FOUND");
		}

		const allowed = await auth.userHasPermission(
			session.userId,
			project.spaceId,
			"space:read",
		);
		if (!allowed) {
			throw new ORPCError("FORBIDDEN");
		}

		return project;
	});

export const deleteProject = base
	.input(v.object({ projectId: v.string() }))
	.handler(async ({ input, context }) => {
		const token = getCookie(context.headers, "auth_session");
		if (!token) throw new ORPCError("UNAUTHORIZED");

		const session = await auth.validateAuthSessionToken(token);
		if (!session) throw new ORPCError("UNAUTHORIZED");

		const project = (
			await sql`SELECT * FROM project WHERE id = ${input.projectId}`
		)[0] as tables["project"];

		if (!project) {
			throw new ORPCError("NOT_FOUND");
		}

		const allowed = await auth.userHasPermission(
			session.userId,
			project.spaceId,
			"space:delete",
		);
		if (!allowed) {
			throw new ORPCError("FORBIDDEN");
		}

		// deleting the space cascades to project, issue, state, project_counter,
		// auth_space_member, and auth_space_invite
		await sql`DELETE FROM auth_space WHERE id = ${project.spaceId}`;

		eventBus.emit({
			type: "project.deleted",
			workspaceId: project.workspaceId,
			actorId: session.userId,
			entityId: project.id,
			payload: {
				name: project.name,
			},
		});

		return { success: true };
	});

export const joinProject = base
	.input(v.object({ projectId: v.string() }))
	.handler(async ({ input, context }) => {
		const token = getCookie(context.headers, "auth_session");
		if (!token) throw new ORPCError("UNAUTHORIZED");

		const session = await auth.validateAuthSessionToken(token);
		if (!session) throw new ORPCError("UNAUTHORIZED");

		const project = (
			await sql`SELECT * FROM project WHERE id = ${input.projectId}`
		)[0] as tables["project"];

		if (!project) {
			throw new ORPCError("NOT_FOUND");
		}

		if (project.access !== "public") {
			throw new ORPCError("FORBIDDEN", {
				message: "This project is private. Ask a member to invite you.",
			});
		}

		const member: tables["auth_space_member"] = {
			id: crypto.randomUUID(),
			spaceId: project.spaceId,
			userId: session.userId,
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
