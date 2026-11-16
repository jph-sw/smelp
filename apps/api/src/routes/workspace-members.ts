import { ORPCError } from "@orpc/server";
import { Auth } from "@smelp/auth";
import { DB, type tables } from "@smelp/db";
import { eventBus } from "@smelp/events";
import * as v from "valibot";
import { requireUser, requireWorkspacePermission } from "../lib/access";
import { changeWorkspaceRole, removeFromWorkspace } from "../lib/membership";
import { displayNameOf } from "../lib/names";
import { base } from "../orpc";

const sql = new DB().sqlite;
const auth = new Auth();

type WorkspaceMember = tables["auth_space_member"] &
	Pick<tables["auth_user"], "fullName" | "displayName" | "email" | "image">;

export const findWorkspaceMembers = base
	.input(v.object({ workspaceId: v.string() }))
	.handler(async ({ input, context }) => {
		const caller = await requireUser(context.headers);

		const workspace = (
			await sql`SELECT * FROM workspace WHERE id = ${input.workspaceId}`
		)[0] as tables["workspace"];

		if (!workspace) {
			throw new ORPCError("NOT_FOUND");
		}

		const allowed = await auth.userHasPermission(
			caller.userId,
			workspace.spaceId,
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
			WHERE auth_space_member.spaceId = ${workspace.spaceId}
		`) as WorkspaceMember[];

		return members;
	});

async function findMemberOrThrow(spaceId: string, memberId: string) {
	const member = (
		await sql`SELECT * FROM auth_space_member WHERE id = ${memberId} AND spaceId = ${spaceId}`
	)[0] as tables["auth_space_member"] | undefined;
	if (!member) throw new ORPCError("NOT_FOUND");
	return member;
}

export const removeWorkspaceMember = base
	.input(v.object({ workspaceId: v.string(), memberId: v.string() }))
	.handler(async ({ input, context }) => {
		const { caller, workspace } = await requireWorkspacePermission(
			context.headers,
			input.workspaceId,
			"members:remove",
		);
		const member = await findMemberOrThrow(workspace.spaceId, input.memberId);

		await removeFromWorkspace(workspace, member);

		eventBus.emit({
			type: "workspace.member_removed",
			workspaceId: workspace.id,
			actorId: caller.userId,
			entityId: member.id,
			payload: {
				userId: member.userId,
				userName: await displayNameOf(member.userId),
				role: member.role,
			},
		});

		return { id: member.id };
	});

export const updateWorkspaceMemberRole = base
	.input(
		v.object({
			workspaceId: v.string(),
			memberId: v.string(),
			role: v.picklist(["guest", "member", "admin"]),
		}),
	)
	.handler(async ({ input, context }) => {
		const { caller, workspace } = await requireWorkspacePermission(
			context.headers,
			input.workspaceId,
			"space:update",
		);
		const member = await findMemberOrThrow(workspace.spaceId, input.memberId);
		if (member.role === input.role) return member;

		await changeWorkspaceRole(workspace, member, input.role);

		eventBus.emit({
			type: "workspace.member_role_changed",
			workspaceId: workspace.id,
			actorId: caller.userId,
			entityId: member.id,
			payload: {
				userId: member.userId,
				userName: await displayNameOf(member.userId),
				field: "role",
				oldValue: member.role,
				newValue: input.role,
			},
		});

		return { ...member, role: input.role };
	});

export const leaveWorkspace = base
	.input(v.object({ workspaceId: v.string() }))
	.handler(async ({ input, context }) => {
		const { caller, workspace } = await requireWorkspacePermission(
			context.headers,
			input.workspaceId,
			"space:read",
		);

		const member = (
			await sql`
				SELECT * FROM auth_space_member
				WHERE spaceId = ${workspace.spaceId} AND userId = ${caller.userId}
			`
		)[0] as tables["auth_space_member"] | undefined;
		if (!member) {
			throw new ORPCError("BAD_REQUEST", {
				message: "You aren't a member of this workspace",
			});
		}

		await removeFromWorkspace(workspace, member);

		eventBus.emit({
			type: "workspace.member_removed",
			workspaceId: workspace.id,
			actorId: caller.userId,
			entityId: member.id,
			payload: {
				userId: member.userId,
				userName: await displayNameOf(member.userId),
				role: member.role,
			},
		});

		return { id: member.id };
	});
