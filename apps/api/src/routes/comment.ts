import { ORPCError } from "@orpc/server";
import { Auth } from "@smelp/auth";
import { DB, DEFAULTS, type tables } from "@smelp/db";
import { eventBus } from "@smelp/events";
import * as v from "valibot";
import { requireProjectPermission, requireSession } from "../lib/access";
import { base } from "../orpc";

const sql = new DB().sqlite;
const auth = new Auth();

async function findIssueOrThrow(issueId: string) {
	const issue = (await sql`SELECT * FROM issue WHERE id = ${issueId}`)[0] as
		| tables["issue"]
		| undefined;
	if (!issue) throw new ORPCError("NOT_FOUND");
	return issue;
}

export type CommentReaction = {
	emoji: string;
	count: number;
	/** Whether the current user is one of the people who reacted. */
	reacted: boolean;
	/** Display names of everyone who reacted, oldest reaction first. */
	users: string[];
};

export const findComments = base
	.input(v.object({ issueId: v.string() }))
	.handler(async ({ input, context }) => {
		const session = await requireSession(context.headers);
		const issue = await findIssueOrThrow(input.issueId);
		await requireProjectPermission(
			context.headers,
			issue.projectId,
			"space:read",
		);

		const comments = (await sql`
			SELECT
				comment.*,
				auth_user.displayName AS authorName,
				auth_user.image AS authorImage
			FROM comment
			LEFT JOIN auth_user ON auth_user.id = comment.authorId
			WHERE comment.issueId = ${issue.id}
			ORDER BY comment.createdAt ASC
		`) as (tables["comment"] & {
			authorName: string | null;
			authorImage: string | null;
		})[];

		const rows = (await sql`
			SELECT
				comment_reaction.commentId,
				comment_reaction.emoji,
				comment_reaction.userId,
				auth_user.displayName AS userName
			FROM comment_reaction
			JOIN comment ON comment.id = comment_reaction.commentId
			JOIN auth_user ON auth_user.id = comment_reaction.userId
			WHERE comment.issueId = ${issue.id}
			ORDER BY comment_reaction.createdAt ASC, comment_reaction.rowid ASC
		`) as {
			commentId: string;
			emoji: string;
			userId: string;
			userName: string;
		}[];

		const byComment = new Map<string, Map<string, CommentReaction>>();
		for (const row of rows) {
			const reactions = byComment.get(row.commentId) ?? new Map();
			const reaction: CommentReaction = reactions.get(row.emoji) ?? {
				emoji: row.emoji,
				count: 0,
				reacted: false,
				users: [],
			};
			reaction.count += 1;
			reaction.reacted ||= row.userId === session.userId;
			reaction.users.push(row.userName);
			reactions.set(row.emoji, reaction);
			byComment.set(row.commentId, reactions);
		}

		return comments.map((comment) => ({
			...comment,
			reactions: [...(byComment.get(comment.id)?.values() ?? [])],
		}));
	});

// Reactions are limited to a small fixed set (DEFAULTS.REACTION_EMOJIS), which keeps
// them tidy and avoids having to validate arbitrary emoji sequences. They are light
// participation, so like comments they are open to read-only guests, but not on an
// archived project. They deliberately leave no activity-feed entry or event.
export const toggleReaction = base
	.input(
		v.object({
			commentId: v.string(),
			emoji: v.picklist(DEFAULTS.REACTION_EMOJIS),
		}),
	)
	.handler(async ({ input, context }) => {
		const session = await requireSession(context.headers);

		const comment = (
			await sql`SELECT * FROM comment WHERE id = ${input.commentId}`
		)[0] as tables["comment"] | undefined;
		if (!comment) throw new ORPCError("NOT_FOUND");

		const issue = await findIssueOrThrow(comment.issueId);
		await requireProjectPermission(
			context.headers,
			issue.projectId,
			"space:read",
			{ write: true },
		);

		const removed = await sql`
			DELETE FROM comment_reaction
			WHERE commentId = ${comment.id}
				AND userId = ${session.userId}
				AND emoji = ${input.emoji}
			RETURNING emoji
		`;
		if (removed.length > 0) return { reacted: false };

		const reaction: tables["comment_reaction"] = {
			commentId: comment.id,
			userId: session.userId,
			emoji: input.emoji,
			createdAt: Date.now(),
		};
		// A concurrent duplicate toggle hits the primary key; treat it as already on.
		await sql`INSERT OR IGNORE INTO comment_reaction ${sql(reaction)}`;
		return { reacted: true };
	});

export const createComment = base
	.input(
		v.object({
			issueId: v.string(),
			body: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(10_000)),
		}),
	)
	.handler(async ({ input, context }) => {
		const session = await requireSession(context.headers);
		const issue = await findIssueOrThrow(input.issueId);
		// Anyone in the project can join the discussion, including read-only guests.
		await requireProjectPermission(
			context.headers,
			issue.projectId,
			"space:read",
			{ write: true },
		);

		const comment: tables["comment"] = {
			id: crypto.randomUUID(),
			issueId: issue.id,
			authorId: session.userId,
			body: input.body,
			createdAt: Date.now(),
			editedAt: null,
		};
		await sql`INSERT INTO comment ${sql(comment)}`;

		eventBus.emit({
			type: "comment.created",
			entityId: comment.id,
			workspaceId: issue.workspaceId,
			actorId: session.userId,
			payload: {
				issueId: issue.id,
				projectId: issue.projectId,
				title: issue.title,
			},
		});

		return comment;
	});

export const updateComment = base
	.input(
		v.object({
			commentId: v.string(),
			body: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(10_000)),
		}),
	)
	.handler(async ({ input, context }) => {
		const session = await requireSession(context.headers);

		const comment = (
			await sql`SELECT * FROM comment WHERE id = ${input.commentId}`
		)[0] as tables["comment"] | undefined;
		if (!comment) throw new ORPCError("NOT_FOUND");

		const issue = await findIssueOrThrow(comment.issueId);
		await requireProjectPermission(
			context.headers,
			issue.projectId,
			"space:read",
			{ write: true },
		);

		// Only the author can reword a comment, admins included: it speaks for them.
		if (comment.authorId !== session.userId) {
			throw new ORPCError("FORBIDDEN");
		}

		const updated: tables["comment"] = {
			...comment,
			body: input.body,
			editedAt: Date.now(),
		};
		await sql`
			UPDATE comment
			SET body = ${updated.body}, editedAt = ${updated.editedAt}
			WHERE id = ${comment.id}
		`;

		eventBus.emit({
			type: "comment.updated",
			entityId: comment.id,
			workspaceId: issue.workspaceId,
			actorId: session.userId,
			payload: {
				issueId: issue.id,
				projectId: issue.projectId,
				title: issue.title,
			},
		});

		return updated;
	});

export const deleteComment = base
	.input(v.object({ id: v.string() }))
	.handler(async ({ input, context }) => {
		const session = await requireSession(context.headers);

		const comment = (
			await sql`SELECT * FROM comment WHERE id = ${input.id}`
		)[0] as tables["comment"] | undefined;
		if (!comment) throw new ORPCError("NOT_FOUND");

		const issue = await findIssueOrThrow(comment.issueId);
		const { project } = await requireProjectPermission(
			context.headers,
			issue.projectId,
			"space:read",
			{ write: true },
		);

		// Authors can remove their own comments; project admins can remove any.
		const canDelete =
			comment.authorId === session.userId ||
			(await auth.userHasPermission(
				session.userId,
				project.spaceId,
				"space:update",
			));
		if (!canDelete) throw new ORPCError("FORBIDDEN");

		await sql`DELETE FROM comment WHERE id = ${comment.id}`;

		return { id: comment.id };
	});
