import { mkdirSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { ORPCError } from "@orpc/server";
import { DB, databasePath, type tables, Utils } from "@smelp/db";
import { eventBus } from "@smelp/events";
import { requireProjectPermission, requireSession } from "./access";
import { detectImageType } from "./avatars";

const sql = new DB().sqlite;
const utils = new Utils();

const DEFAULT_MAX_MB = 25;
// Room for the form's other fields and the multipart boundaries around the file.
const FORM_OVERHEAD_BYTES = 64 * 1024;
const MAX_NAME_LENGTH = 200;
const STORAGE_KEY =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Files live on disk, next to the database unless ATTACHMENTS_PATH says otherwise.
export function attachmentsPath() {
	return (
		process.env.ATTACHMENTS_PATH ??
		path.join(path.dirname(path.resolve(databasePath())), "attachments")
	);
}

export function maxAttachmentBytes() {
	const megabytes = Number(process.env.MAX_ATTACHMENT_MB);
	const limit =
		Number.isFinite(megabytes) && megabytes > 0 ? megabytes : DEFAULT_MAX_MB;
	return Math.floor(limit * 1024 * 1024);
}

// What the server has to accept for an upload at the limit to get through.
export const maxRequestBytes = () => maxAttachmentBytes() + FORM_OVERHEAD_BYTES;

// The path is built from a key the server generated, never from anything the client
// sent, and a key that doesn't look like one is refused.
function fileFor(storageKey: string) {
	if (!STORAGE_KEY.test(storageKey)) {
		throw new Error("Invalid attachment storage key");
	}
	return path.join(attachmentsPath(), storageKey);
}

export async function removeAttachmentFiles(storageKeys: string[]) {
	await Promise.all(
		storageKeys.map(async (key) => {
			try {
				await rm(fileFor(key), { force: true });
			} catch (error) {
				utils.logger.warn("Couldn't remove an attachment file", error);
			}
		}),
	);
}

type Keys = Pick<tables["attachment"], "storageKey">[];

// The rows go with their work item, comment, project or workspace, so the keys have
// to be read before that delete, and the files removed after it succeeds.
export async function attachmentKeysOfIssue(issueId: string) {
	const rows = (await sql`
		SELECT storageKey FROM attachment WHERE issueId = ${issueId}
	`) as Keys;
	return rows.map((row) => row.storageKey);
}

export async function attachmentKeysOfComment(commentId: string) {
	const rows = (await sql`
		SELECT storageKey FROM attachment WHERE commentId = ${commentId}
	`) as Keys;
	return rows.map((row) => row.storageKey);
}

export async function attachmentKeysOfProject(projectId: string) {
	const rows = (await sql`
		SELECT attachment.storageKey FROM attachment
		JOIN issue ON issue.id = attachment.issueId
		WHERE issue.projectId = ${projectId}
	`) as Keys;
	return rows.map((row) => row.storageKey);
}

export async function attachmentKeysOfWorkspace(workspaceId: string) {
	const rows = (await sql`
		SELECT attachment.storageKey FROM attachment
		JOIN issue ON issue.id = attachment.issueId
		WHERE issue.workspaceId = ${workspaceId}
	`) as Keys;
	return rows.map((row) => row.storageKey);
}

// A name is only ever shown and offered as the download's name, but it still drops
// anything that looks like a path or a control character.
export function cleanFileName(raw: string) {
	const base = raw.split(/[\\/]/).pop() ?? "";
	const cleaned = Array.from(base)
		.filter((character) => {
			const code = character.codePointAt(0) ?? 0;
			return code >= 0x20 && code !== 0x7f;
		})
		.join("")
		.trim()
		.replace(/^\.+/, "")
		.slice(0, MAX_NAME_LENGTH)
		.trim();
	return cleaned || "file";
}

const INLINE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

const fail = (status: number, message: string) =>
	new Response(message, { status });

const tooLarge = (limit: number) =>
	fail(
		413,
		`That file is too large. The limit is ${Math.floor(limit / 1024 / 1024)} MB.`,
	);

function failure(error: unknown) {
	if (error instanceof ORPCError) return fail(error.status, error.message);
	throw error;
}

export async function uploadAttachment(request: Request) {
	try {
		if (request.method !== "POST") return fail(405, "Method not allowed");

		const limit = maxAttachmentBytes();
		const declared = Number(request.headers.get("content-length"));
		if (declared > limit + FORM_OVERHEAD_BYTES) return tooLarge(limit);

		// Everything is checked before the body is read, so a refused upload is cheap.
		const url = new URL(request.url);
		const issueId = url.searchParams.get("issueId");
		if (!issueId) return fail(400, "Missing work item");
		const issue = (await sql`SELECT * FROM issue WHERE id = ${issueId}`)[0] as
			| tables["issue"]
			| undefined;
		if (!issue) return fail(404, "Work item not found");
		const { session } = await requireProjectPermission(
			request.headers,
			issue.projectId,
			"content:write",
		);

		const commentId = url.searchParams.get("commentId");
		if (commentId) {
			const comment = (
				await sql`SELECT * FROM comment WHERE id = ${commentId}`
			)[0] as tables["comment"] | undefined;
			if (!comment || comment.issueId !== issue.id) {
				return fail(404, "Comment not found");
			}
			// Like editing it, adding to a comment is for the person it speaks for.
			if (comment.authorId !== session.userId) {
				return fail(403, "Only the author can attach files to a comment");
			}
		}

		let file: unknown;
		try {
			file = (await request.formData()).get("file");
		} catch {
			return fail(400, "Expected a file upload");
		}
		if (!(file instanceof File)) return fail(400, "No file was sent");
		if (file.size > limit) return tooLarge(limit);

		const detected = detectImageType(
			new Uint8Array(await file.arrayBuffer(), 0, Math.min(16, file.size)),
		);
		const claimed = file.type.split(";")[0]?.trim().toLowerCase() ?? "";
		// An image type is only believed when the bytes agree, since it decides
		// whether a browser may show the file instead of downloading it.
		const contentType =
			detected ??
			(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(claimed) &&
			!INLINE_TYPES.has(claimed)
				? claimed
				: "application/octet-stream");

		const attachment: tables["attachment"] = {
			id: crypto.randomUUID(),
			issueId: issue.id,
			commentId: commentId || null,
			uploaderId: session.userId,
			name: cleanFileName(file.name),
			size: file.size,
			contentType,
			storageKey: crypto.randomUUID(),
			createdAt: Date.now(),
		};

		mkdirSync(attachmentsPath(), { recursive: true, mode: 0o700 });
		await Bun.write(fileFor(attachment.storageKey), file);
		try {
			// This fails if the work item was deleted while the file was being written.
			await sql`INSERT INTO attachment ${sql(attachment)}`;
		} catch (error) {
			await removeAttachmentFiles([attachment.storageKey]);
			throw error;
		}

		eventBus.emit({
			type: "issue.attachment_added",
			entityId: issue.id,
			workspaceId: issue.workspaceId,
			actorId: session.userId,
			payload: {
				projectId: issue.projectId,
				title: issue.title,
				field: "attachment",
				oldValue: null,
				newValue: attachment.name,
			},
		});

		const { storageKey: _storageKey, ...visible } = attachment;
		return Response.json(visible, { status: 201 });
	} catch (error) {
		return failure(error);
	}
}

export async function attachmentResponse(headers: Headers, id: string) {
	try {
		// Signed-out visitors learn nothing about what exists.
		await requireSession(headers);
		const attachment = (
			await sql`SELECT * FROM attachment WHERE id = ${id}`
		)[0] as tables["attachment"] | undefined;
		if (!attachment) return fail(404, "Not found");

		const issue = (
			await sql`SELECT projectId FROM issue WHERE id = ${attachment.issueId}`
		)[0] as Pick<tables["issue"], "projectId"> | undefined;
		if (!issue) return fail(404, "Not found");
		await requireProjectPermission(headers, issue.projectId, "space:read");

		const file = Bun.file(fileFor(attachment.storageKey));
		if (!(await file.exists())) return fail(404, "The file is missing");

		const inline = INLINE_TYPES.has(attachment.contentType);
		const fallback = attachment.name.replace(/[^\x20-\x7e]|["\\%]/g, "_");
		return new Response(file, {
			headers: {
				"Content-Type": inline
					? attachment.contentType
					: "application/octet-stream",
				"Content-Length": String(attachment.size),
				"Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
				"X-Content-Type-Options": "nosniff",
				// Nothing in a download should ever run, even if a browser opens it.
				"Content-Security-Policy": "default-src 'none'; sandbox",
				"Cache-Control": "private, max-age=3600",
			},
		});
	} catch (error) {
		return failure(error);
	}
}
