import { ORPCError } from "@orpc/server";
import { Auth } from "@smelp/auth";
import { DB, type tables } from "@smelp/db";
import { eventBus } from "@smelp/events";
import { SQL } from "bun";
import * as v from "valibot";
import { requireSession, requireWorkspacePermission } from "../lib/access";
import { findUsableInvite, INVITE_LIFETIME_MS } from "../lib/invites";
import {
	type EmailDelivery,
	isMailEnabled,
	sendInviteEmail,
} from "../lib/mail";
import { RateLimiter } from "../lib/rate-limit";
import { createSecretToken, hashSecretToken } from "../lib/tokens";
import { base } from "../orpc";

const sql = new DB().sqlite;
const auth = new Auth();

// Invites reach any address, so this stops an account from being used to send spam.
const inviteEmailsByUser = new RateLimiter(30, 60 * 60 * 1000);

const invalidLink = () =>
	new ORPCError("NOT_FOUND", {
		message: "This invite link is invalid or has expired.",
	});

export const createInvite = base
	.input(
		v.object({
			workspaceId: v.string(),
			email: v.optional(v.pipe(v.string(), v.email(), v.toLowerCase())),
			role: v.picklist(["guest", "member", "admin"]),
		}),
	)
	.handler(async ({ input, context }) => {
		const { session, workspace } = await requireWorkspacePermission(
			context.headers,
			input.workspaceId,
			"members:invite",
		);

		if (input.email) {
			const existingMembers = await sql`
				SELECT auth_space_member.id
				FROM auth_space_member
				JOIN auth_user ON auth_user.id = auth_space_member.userId
				WHERE auth_space_member.spaceId = ${workspace.spaceId}
					AND auth_user.email = ${input.email}
			`;
			if (existingMembers[0]) {
				throw new ORPCError("CONFLICT", {
					message: "This user is already a member of the workspace",
				});
			}
		}

		const token = createSecretToken();
		const now = Date.now();
		const invite: tables["auth_space_invite"] = {
			id: crypto.randomUUID(),
			spaceId: workspace.spaceId,
			email: input.email ?? null,
			role: input.role,
			invitedByUserId: session.userId,
			createdAt: now,
			acceptedAt: null,
			tokenHash: hashSecretToken(token),
			expiresAt: now + INVITE_LIFETIME_MS,
		};
		await sql`INSERT INTO auth_space_invite ${sql(invite)}`;

		eventBus.emit({
			type: "workspace.member_invited",
			workspaceId: workspace.id,
			actorId: session.userId,
			entityId: invite.id,
			payload: { email: invite.email, role: invite.role },
		});

		let emailDelivery: EmailDelivery = "none";
		if (invite.email && isMailEnabled()) {
			if (inviteEmailsByUser.consume(session.userId).allowed) {
				const inviter = (
					await sql`SELECT displayName FROM auth_user WHERE id = ${session.userId}`
				)[0] as Pick<tables["auth_user"], "displayName">;
				emailDelivery = await sendInviteEmail({
					to: invite.email,
					workspaceName: workspace.name,
					inviterName: inviter.displayName,
					token,
				});
			} else {
				emailDelivery = "failed";
			}
		}

		// Only the hash is stored, so this response is the one chance to see the token.
		return {
			id: invite.id,
			email: invite.email,
			role: invite.role,
			expiresAt: invite.expiresAt,
			token,
			emailDelivery,
		};
	});

export const findInvites = base
	.input(v.object({ workspaceId: v.string() }))
	.handler(async ({ input, context }) => {
		const { workspace } = await requireWorkspacePermission(
			context.headers,
			input.workspaceId,
			"members:invite",
		);

		return (await sql`
			SELECT id, email, role, createdAt, expiresAt
			FROM auth_space_invite
			WHERE spaceId = ${workspace.spaceId}
				AND acceptedAt IS NULL
				AND expiresAt > ${Date.now()}
			ORDER BY createdAt DESC
		`) as Pick<
			tables["auth_space_invite"],
			"id" | "email" | "role" | "createdAt" | "expiresAt"
		>[];
	});

export const cancelInvite = base
	.input(v.object({ inviteId: v.string() }))
	.handler(async ({ input, context }) => {
		const session = await requireSession(context.headers);

		const invite = (
			await sql`SELECT spaceId FROM auth_space_invite WHERE id = ${input.inviteId}`
		)[0] as Pick<tables["auth_space_invite"], "spaceId"> | undefined;
		if (!invite) throw new ORPCError("NOT_FOUND");

		const allowed = await auth.userHasPermission(
			session.userId,
			invite.spaceId,
			"members:invite",
		);
		if (!allowed) throw new ORPCError("FORBIDDEN");

		await sql`DELETE FROM auth_space_invite WHERE id = ${input.inviteId}`;

		return { id: input.inviteId };
	});

// Public: whoever holds the link needs to see what they're joining before they
// have an account. The token is the access control, and it only reveals these two.
export const previewInvite = base
	.input(v.object({ token: v.string() }))
	.handler(async ({ input }) => {
		const invite = await findUsableInvite(input.token);
		if (!invite) throw invalidLink();

		const workspace = (
			await sql`SELECT name FROM workspace WHERE spaceId = ${invite.spaceId}`
		)[0] as Pick<tables["workspace"], "name"> | undefined;
		if (!workspace) throw invalidLink();

		return { workspaceName: workspace.name, role: invite.role };
	});

export const acceptInvite = base
	.input(v.object({ token: v.string() }))
	.handler(async ({ input, context }) => {
		const session = await requireSession(context.headers);

		const invite = await findUsableInvite(input.token);
		if (!invite) throw invalidLink();

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
				// Claims the link first, so it can only ever be used once.
				const claimed = await tx`
					UPDATE auth_space_invite SET acceptedAt = ${now}
					WHERE id = ${invite.id} AND acceptedAt IS NULL
					RETURNING id
				`;
				if (claimed.length === 0) throw invalidLink();

				await tx`INSERT INTO auth_space_member ${tx(member)}`;
			});
		} catch (e) {
			if (
				e instanceof SQL.SQLiteError &&
				e.code === "SQLITE_CONSTRAINT_UNIQUE"
			) {
				throw new ORPCError("CONFLICT", {
					message: "You are already a member of this workspace",
				});
			}
			throw e;
		}

		const workspace = (
			await sql`SELECT id FROM workspace WHERE spaceId = ${invite.spaceId}`
		)[0] as Pick<tables["workspace"], "id"> | undefined;

		eventBus.emit({
			type: "workspace.member_joined",
			workspaceId: workspace?.id ?? "",
			actorId: session.userId,
			entityId: member.id,
			payload: { userId: session.userId, role: member.role },
		});

		return { workspaceId: workspace?.id ?? null };
	});
