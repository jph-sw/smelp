import { ORPCError } from "@orpc/server";
import { Auth } from "@smelp/auth";
import { DB, type tables } from "@smelp/db";
import * as v from "valibot";
import { requireUser } from "../lib/access";
import { base } from "../orpc";

const sql = new DB().sqlite;
const auth = new Auth();

const PAGE_SIZE = 50;

const Cursor = v.object({
	createdAt: v.pipe(v.number(), v.integer()),
	id: v.string(),
});

export type InboxItem = tables["notification"] & {
	actorName: string | null;
	actorImage: string | null;
};

// Access is checked when the inbox is read, not only when a notification is made,
// so someone removed from a project, or a project made private, stops seeing its
// items at once. The item must still exist and be readable by the person asking.
function readable(userId: string, isInstanceAdmin: boolean) {
	return sql`
		EXISTS (
			SELECT 1 FROM project p
			WHERE p.id = notification.projectId
				AND (
					${isInstanceAdmin ? 1 : 0} = 1
					OR EXISTS (
						SELECT 1 FROM auth_space_member m
						WHERE m.spaceId = p.spaceId AND m.userId = ${userId}
					)
				)
		)
	`;
}

export const findNotifications = base
	.input(v.object({ workspaceId: v.string(), before: v.optional(Cursor) }))
	.handler(async ({ input, context }) => {
		const caller = await requireUser(context.headers);
		const isAdmin = await auth.isInstanceAdmin(caller.userId);
		const beforeAt = input.before?.createdAt ?? null;
		const beforeId = input.before?.id ?? "";

		const rows = (await sql`
			SELECT
				notification.*,
				actor.displayName AS actorName,
				actor.image AS actorImage
			FROM notification
			LEFT JOIN auth_user actor ON actor.id = notification.actorId
			WHERE notification.userId = ${caller.userId}
				AND notification.workspaceId = ${input.workspaceId}
				AND ${readable(caller.userId, isAdmin)}
				AND (
					${beforeAt} IS NULL
					OR notification.createdAt < ${beforeAt}
					OR (notification.createdAt = ${beforeAt} AND notification.id < ${beforeId})
				)
			ORDER BY notification.createdAt DESC, notification.id DESC
			LIMIT ${PAGE_SIZE + 1}
		`) as InboxItem[];

		const page = rows.slice(0, PAGE_SIZE);
		const last = page.at(-1);
		return {
			notifications: page,
			next:
				rows.length > PAGE_SIZE && last
					? { createdAt: last.createdAt, id: last.id }
					: null,
		};
	});

export const countUnreadNotifications = base
	.input(v.object({ workspaceId: v.string() }))
	.handler(async ({ input, context }) => {
		const caller = await requireUser(context.headers);
		const isAdmin = await auth.isInstanceAdmin(caller.userId);
		const row = (
			await sql`
				SELECT COUNT(*) AS count FROM notification
				WHERE userId = ${caller.userId}
					AND workspaceId = ${input.workspaceId}
					AND readAt IS NULL
					AND ${readable(caller.userId, isAdmin)}
			`
		)[0] as { count: number };
		return { count: Number(row.count) };
	});

export const markNotificationRead = base
	.input(v.object({ id: v.string() }))
	.handler(async ({ input, context }) => {
		const caller = await requireUser(context.headers);
		const row = (
			await sql`SELECT id FROM notification WHERE id = ${input.id} AND userId = ${caller.userId}`
		)[0];
		// Someone else's notification looks the same as one that doesn't exist.
		if (!row) throw new ORPCError("NOT_FOUND");
		await sql`
			UPDATE notification SET readAt = ${Date.now()}
			WHERE id = ${input.id} AND readAt IS NULL
		`;
		return { id: input.id };
	});

export const markAllNotificationsRead = base
	.input(v.object({ workspaceId: v.string() }))
	.handler(async ({ input, context }) => {
		const caller = await requireUser(context.headers);
		await sql`
			UPDATE notification SET readAt = ${Date.now()}
			WHERE userId = ${caller.userId}
				AND workspaceId = ${input.workspaceId}
				AND readAt IS NULL
		`;
		return { success: true };
	});

// Called when someone opens a work item: having seen it is as good as having read
// the notification.
export const markIssueNotificationRead = base
	.input(v.object({ issueId: v.string() }))
	.handler(async ({ input, context }) => {
		const caller = await requireUser(context.headers);
		await sql`
			UPDATE notification SET readAt = ${Date.now()}
			WHERE userId = ${caller.userId}
				AND issueId = ${input.issueId}
				AND readAt IS NULL
		`;
		return { success: true };
	});
