import { ORPCError } from "@orpc/server";
import { Auth } from "@smelp/auth";
import { DB, type tables } from "@smelp/db";
import { eventBus } from "@smelp/events";
import * as v from "valibot";
import { requireProjectPermission, requireSession } from "../lib/access";
import {
	attachmentKeysOfComment,
	removeAttachmentFiles,
} from "../lib/attachments";
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

export const findComments = base
	.input(v.object({ issueId: v.string() }))
	.handler(async ({ input, context }) => {
		await requireSession(context.headers);
		const issue = await findIssueOrThrow(input.issueId);
		await requireProjectPermission(
			context.headers,
			issue.projectId,
			"space:read",
		);

		return (await sql`
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

		const files = await attachmentKeysOfComment(comment.id);
		await sql`DELETE FROM comment WHERE id = ${comment.id}`;
		await removeAttachmentFiles(files);

		return { id: comment.id };
	});
