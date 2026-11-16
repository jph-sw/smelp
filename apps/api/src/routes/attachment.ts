import { ORPCError } from "@orpc/server";
import { Auth } from "@smelp/auth";
import { DB, type tables } from "@smelp/db";
import { eventBus } from "@smelp/events";
import * as v from "valibot";
import { requireProjectPermission, requireUser } from "../lib/access";
import { maxAttachmentBytes, removeAttachmentFiles } from "../lib/attachments";
import { base } from "../orpc";

const sql = new DB().sqlite;
const auth = new Auth();

// So the web app can say a file is too large before sending it.
export const findAttachmentLimits = base.handler(async ({ context }) => {
	await requireUser(context.headers);
	return { maxBytes: maxAttachmentBytes() };
});

export const findAttachments = base
	.input(v.object({ issueId: v.string() }))
	.handler(async ({ input, context }) => {
		await requireUser(context.headers);
		const issue = (
			await sql`SELECT projectId FROM issue WHERE id = ${input.issueId}`
		)[0] as Pick<tables["issue"], "projectId"> | undefined;
		if (!issue) throw new ORPCError("NOT_FOUND");
		await requireProjectPermission(
			context.headers,
			issue.projectId,
			"space:read",
		);

		// The storage key stays on the server: files are only reached by id.
		return (await sql`
			SELECT
				attachment.id,
				attachment.issueId,
				attachment.commentId,
				attachment.uploaderId,
				attachment.name,
				attachment.size,
				attachment.contentType,
				attachment.createdAt,
				auth_user.displayName AS uploaderName
			FROM attachment
			LEFT JOIN auth_user ON auth_user.id = attachment.uploaderId
			WHERE attachment.issueId = ${input.issueId}
			ORDER BY attachment.createdAt ASC
		`) as (Omit<tables["attachment"], "storageKey"> & {
			uploaderName: string | null;
		})[];
	});

export const deleteAttachment = base
	.input(v.object({ id: v.string() }))
	.handler(async ({ input, context }) => {
		const caller = await requireUser(context.headers);

		const attachment = (
			await sql`SELECT * FROM attachment WHERE id = ${input.id}`
		)[0] as tables["attachment"] | undefined;
		if (!attachment) throw new ORPCError("NOT_FOUND");

		const issue = (
			await sql`SELECT * FROM issue WHERE id = ${attachment.issueId}`
		)[0] as tables["issue"] | undefined;
		if (!issue) throw new ORPCError("NOT_FOUND");

		// Writing, so guests and archived projects are refused.
		const { project } = await requireProjectPermission(
			context.headers,
			issue.projectId,
			"content:write",
		);

		const canDelete =
			attachment.uploaderId === caller.userId ||
			(await auth.userHasPermission(
				caller.userId,
				project.spaceId,
				"space:update",
			));
		if (!canDelete) throw new ORPCError("FORBIDDEN");

		await sql`DELETE FROM attachment WHERE id = ${attachment.id}`;
		await removeAttachmentFiles([attachment.storageKey]);

		eventBus.emit({
			type: "issue.attachment_removed",
			entityId: issue.id,
			workspaceId: issue.workspaceId,
			actorId: caller.userId,
			payload: {
				projectId: issue.projectId,
				title: issue.title,
				field: "attachment",
				oldValue: attachment.name,
				newValue: null,
			},
		});

		return { id: attachment.id };
	});
