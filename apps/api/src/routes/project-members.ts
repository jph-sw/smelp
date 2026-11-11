import { ORPCError } from "@orpc/server";
import { getCookie } from "@orpc/server/helpers";
import { Auth } from "@smelp/auth";
import { DB, type ProjectMember, type tables } from "@smelp/db";
import { eventBus } from "@smelp/events";
import { SQL } from "bun";
import * as v from "valibot";
import { requireProjectPermission } from "../lib/access";
import { base } from "../orpc";

const sql = new DB().sqlite;
const auth = new Auth();

export const findProjectMembers = base
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

		const members = (await sql`
			SELECT
				auth_space_member.*,
				auth_user.fullName,
				auth_user.displayName,
				auth_user.email,
				auth_user.image
			FROM auth_space_member
			JOIN auth_user ON auth_user.id = auth_space_member.userId
			WHERE auth_space_member.spaceId = ${project.spaceId}
		`) as ProjectMember[];

		return members;
	});

/* workspace members who have access to the project's parent workspace,
   but are not yet members of the project itself */
export const findAvailableProjectMembers = base
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
			"members:invite",
		);
		if (!allowed) {
			throw new ORPCError("FORBIDDEN");
		}

		const workspace = (
			await sql`SELECT * FROM workspace WHERE id = ${project.workspaceId}`
		)[0] as tables["workspace"];

		const members = (await sql`
			SELECT
				auth_space_member.*,
				auth_user.fullName,
				auth_user.displayName,
				auth_user.email,
				auth_user.image
			FROM auth_space_member
			JOIN auth_user ON auth_user.id = auth_space_member.userId
			WHERE auth_space_member.spaceId = ${workspace.spaceId}
				AND auth_user.id NOT IN (
					SELECT userId FROM auth_space_member WHERE spaceId = ${project.spaceId}
				)
		`) as ProjectMember[];

		return members;
	});

export const addProjectMember = base
	.input(
		v.object({
			projectId: v.string(),
			userId: v.string(),
			role: v.picklist(["guest", "member", "admin"]),
		}),
	)
	.handler(async ({ input, context }) => {
		const { session, project } = await requireProjectPermission(
			context.headers,
			input.projectId,
			"members:invite",
		);

		const workspace = (
			await sql`SELECT * FROM workspace WHERE id = ${project.workspaceId}`
		)[0] as tables["workspace"];

		const workspaceMembers = (await sql`
			SELECT * FROM auth_space_member
			WHERE spaceId = ${workspace.spaceId} AND userId = ${input.userId}
		`) as tables["auth_space_member"][];

		if (!workspaceMembers[0]) {
			throw new ORPCError("BAD_REQUEST", {
				message: "This user does not have access to the workspace",
			});
		}

		const member: tables["auth_space_member"] = {
			id: crypto.randomUUID(),
			spaceId: project.spaceId,
			userId: input.userId,
			role: input.role,
			createdAt: Date.now(),
		};

		try {
			await sql`INSERT INTO auth_space_member ${sql(member)}`;
		} catch (e) {
			if (e instanceof SQL.SQLiteError) {
				if (e.code === "SQLITE_CONSTRAINT_UNIQUE") {
					throw new ORPCError("CONFLICT", {
						message: "This user is already a member of the project",
					});
				}
			}
			throw e;
		}

		eventBus.emit({
			type: "workspace.member_joined",
			workspaceId: project.workspaceId,
			actorId: session.userId,
			entityId: member.id,
			payload: { userId: member.userId, role: member.role },
		});

		return member;
	});

export const removeProjectMember = base
	.input(
		v.object({
			projectId: v.string(),
			memberId: v.string(),
		}),
	)
	.handler(async ({ input, context }) => {
		const { session, project } = await requireProjectPermission(
			context.headers,
			input.projectId,
			"members:remove",
		);

		const member = (
			await sql`
				SELECT * FROM auth_space_member
				WHERE id = ${input.memberId} AND spaceId = ${project.spaceId}
			`
		)[0] as tables["auth_space_member"];

		if (!member) {
			throw new ORPCError("NOT_FOUND");
		}

		await sql.begin(async (tx) => {
			if (member.role === "admin") {
				const others = await tx`
					SELECT id FROM auth_space_member
					WHERE spaceId = ${project.spaceId} AND role = 'admin' AND id != ${member.id}
				`;
				if (others.length === 0) {
					throw new ORPCError("BAD_REQUEST", {
						message: "Make someone else a project admin first.",
					});
				}
			}
			await tx`DELETE FROM auth_space_member WHERE id = ${member.id}`;
		});

		eventBus.emit({
			type: "workspace.member_removed",
			workspaceId: project.workspaceId,
			actorId: session.userId,
			entityId: member.id,
			payload: { userId: member.userId, role: member.role },
		});

		return { id: member.id };
	});
