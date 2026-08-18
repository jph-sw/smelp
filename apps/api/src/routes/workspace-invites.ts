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

export const createInvite = base
	.input(
		v.object({
			workspaceId: v.string(),
			email: v.pipe(v.string(), v.email()),
			role: v.picklist(["guest", "member", "admin"]),
		}),
	)
	.handler(async ({ input, context }) => {
		const token = getCookie(context.headers, "auth_session");
		if (!token) throw new ORPCError("UNAUTHORIZED");

		const session = await auth.validateAuthSessionToken(token);
		if (!session) throw new ORPCError("UNAUTHORIZED");

		const workspace = (
			await sql`SELECT * FROM workspace WHERE id = ${input.workspaceId}`
		)[0] as tables["workspace"];

		if (!workspace) {
			throw new ORPCError("NOT_FOUND");
		}

		const allowed = await auth.userHasPermission(
			session.userId,
			workspace.spaceId,
			"members:invite",
		);
		if (!allowed) {
			throw new ORPCError("FORBIDDEN");
		}

		const existingMembers = (await sql`
			SELECT auth_space_member.*
			FROM auth_space_member
			JOIN auth_user ON auth_user.id = auth_space_member.userId
			WHERE auth_space_member.spaceId = ${workspace.spaceId}
				AND auth_user.email = ${input.email}
		`) as tables["auth_space_member"][];

		if (existingMembers[0]) {
			throw new ORPCError("CONFLICT", {
				message: "This user is already a member of the workspace",
			});
		}

		const invite: tables["auth_space_invite"] = {
			id: crypto.randomUUID(),
			spaceId: workspace.spaceId,
			email: input.email,
			role: input.role,
			invitedByUserId: session.userId,
			createdAt: Date.now(),
			acceptedAt: null,
		};

		try {
			await sql`INSERT INTO auth_space_invite ${sql(invite)}`;
		} catch (e) {
			if (e instanceof SQL.SQLiteError) {
				if (e.code === "SQLITE_CONSTRAINT_UNIQUE") {
					throw new ORPCError("CONFLICT", {
						message: "This email already has a pending invite",
					});
				}
			}
			throw e;
		}

		eventBus.emit({
			type: "workspace.member_invited",
			workspaceId: workspace.id,
			actorId: session.userId,
			entityId: invite.id,
			payload: { email: invite.email, role: invite.role },
		});

		return invite;
	});

export const findInvites = base
	.input(v.object({ workspaceId: v.string() }))
	.handler(async ({ input, context }) => {
		const token = getCookie(context.headers, "auth_session");
		if (!token) throw new ORPCError("UNAUTHORIZED");

		const session = await auth.validateAuthSessionToken(token);
		if (!session) throw new ORPCError("UNAUTHORIZED");

		const workspace = (
			await sql`SELECT * FROM workspace WHERE id = ${input.workspaceId}`
		)[0] as tables["workspace"];

		if (!workspace) {
			throw new ORPCError("NOT_FOUND");
		}

		const allowed = await auth.userHasPermission(
			session.userId,
			workspace.spaceId,
			"members:invite",
		);
		if (!allowed) {
			throw new ORPCError("FORBIDDEN");
		}

		const invites = (await sql`
			SELECT * FROM auth_space_invite
			WHERE spaceId = ${workspace.spaceId} AND acceptedAt IS NULL
			ORDER BY createdAt DESC
		`) as tables["auth_space_invite"][];

		return invites;
	});

export const cancelInvite = base
	.input(v.object({ inviteId: v.string() }))
	.handler(async ({ input, context }) => {
		const token = getCookie(context.headers, "auth_session");
		if (!token) throw new ORPCError("UNAUTHORIZED");

		const session = await auth.validateAuthSessionToken(token);
		if (!session) throw new ORPCError("UNAUTHORIZED");

		const invite = (
			await sql`SELECT * FROM auth_space_invite WHERE id = ${input.inviteId}`
		)[0] as tables["auth_space_invite"];

		if (!invite) {
			throw new ORPCError("NOT_FOUND");
		}

		const allowed = await auth.userHasPermission(
			session.userId,
			invite.spaceId,
			"members:invite",
		);
		if (!allowed) {
			throw new ORPCError("FORBIDDEN");
		}

		await sql`DELETE FROM auth_space_invite WHERE id = ${invite.id}`;

		return { id: invite.id };
	});

export const findMyInvites = base.handler(async ({ context }) => {
	const token = getCookie(context.headers, "auth_session");
	if (!token) throw new ORPCError("UNAUTHORIZED");

	const session = await auth.validateAuthSessionToken(token);
	if (!session) throw new ORPCError("UNAUTHORIZED");

	const user = (
		await sql`SELECT * FROM auth_user WHERE id = ${session.userId}`
	)[0] as tables["auth_user"];

	const invites = (await sql`
		SELECT
			auth_space_invite.*,
			workspace.id as workspaceId,
			workspace.name as workspaceName
		FROM auth_space_invite
		JOIN workspace ON workspace.spaceId = auth_space_invite.spaceId
		WHERE auth_space_invite.email = ${user.email} AND auth_space_invite.acceptedAt IS NULL
		ORDER BY auth_space_invite.createdAt DESC
	`) as (tables["auth_space_invite"] & {
		workspaceId: string;
		workspaceName: string;
	})[];

	return invites;
});

export const acceptInvite = base
	.input(v.object({ inviteId: v.string() }))
	.handler(async ({ input, context }) => {
		const token = getCookie(context.headers, "auth_session");
		if (!token) throw new ORPCError("UNAUTHORIZED");

		const session = await auth.validateAuthSessionToken(token);
		if (!session) throw new ORPCError("UNAUTHORIZED");

		const invite = (
			await sql`SELECT * FROM auth_space_invite WHERE id = ${input.inviteId}`
		)[0] as tables["auth_space_invite"];

		if (!invite || invite.acceptedAt != null) {
			throw new ORPCError("NOT_FOUND");
		}

		const user = (
			await sql`SELECT * FROM auth_user WHERE id = ${session.userId}`
		)[0] as tables["auth_user"];

		if (user.email !== invite.email) {
			throw new ORPCError("FORBIDDEN", {
				message: "This invite was sent to a different email address",
			});
		}

		const now = Date.now();

		const member: tables["auth_space_member"] = {
			id: crypto.randomUUID(),
			spaceId: invite.spaceId,
			userId: session.userId,
			role: invite.role,
			createdAt: now,
		};

		try {
			await sql.begin(async (tx) => {
				await tx`INSERT INTO auth_space_member ${tx(member)}`;
				await tx`UPDATE auth_space_invite SET acceptedAt = ${now} WHERE id = ${invite.id}`;
			});
		} catch (e) {
			if (e instanceof SQL.SQLiteError) {
				if (e.code === "SQLITE_CONSTRAINT_UNIQUE") {
					throw new ORPCError("CONFLICT", {
						message: "You are already a member of this workspace",
					});
				}
			}
			throw e;
		}

		const workspace = (
			await sql`SELECT * FROM workspace WHERE spaceId = ${invite.spaceId}`
		)[0] as tables["workspace"];

		eventBus.emit({
			type: "workspace.member_joined",
			workspaceId: workspace?.id ?? "",
			actorId: session.userId,
			entityId: member.id,
			payload: { userId: session.userId, role: member.role },
		});

		return { member, workspaceId: workspace?.id ?? null };
	});
