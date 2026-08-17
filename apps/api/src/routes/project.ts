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
			name: v.pipe(v.string(), v.minLength(6), v.maxLength(32)),
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

		const project: tables["project"] = {
			id: input.id,
			name: input.name,
			description: input.description,
			access: input.access,
			leadUserId: null,
			defaultAssigneeUserId: null,
			workspaceId: input.workspaceId,
			image: null,
			icon: input.icon,
			createdBy: session.userId,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		};

		const project_member: tables["project_member"] = {
			id: crypto.randomUUID(),
			projectId: project.id,
			userId: session.userId,
		};

		const project_counter: tables["project_counter"] = {
			projectId: project.id,
			lastNumber: 0,
		};

		const states: tables["state"][] = [
			{
				id: "backlog",
				name: "Backlog",
				color: "#ffffff",
				group: "backlog",
				projectId: project.id,
				isDefault: true,
			},
			{
				id: "todo",
				name: "Todo",
				color: "#ffffff",
				group: "unstarted",
				projectId: project.id,
				isDefault: false,
			},
			{
				id: "in_progress",
				name: "In Progress",
				color: "#ffffff",
				group: "started",
				projectId: project.id,
				isDefault: false,
			},
			{
				id: "done",
				name: "Done",
				color: "#ffffff",
				group: "completed",
				projectId: project.id,
				isDefault: false,
			},
		];

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

		await sql`INSERT INTO project_member ${sql(project_member)}`;
		await sql`INSERT INTO project_counter ${sql(project_counter)}`;
		await sql`INSERT INTO state ${sql(states)}`;

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
	.handler(async ({ input }) => {
		const project = (
			await sql`SELECT * FROM project WHERE id = ${input.projectId}`
		)[0] as tables["project"];

		return project;
	});
