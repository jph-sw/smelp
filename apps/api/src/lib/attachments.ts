import { mkdirSync, readdirSync, statSync } from "node:fs";
import { chmod, rm } from "node:fs/promises";
import path from "node:path";
import { ORPCError } from "@orpc/server";
import { DB, databasePath, type tables, Utils } from "@smelp/db";
import { eventBus } from "@smelp/events";
import {
	requireIssueRead,
	requireProjectPermission,
	requireUser,
} from "./access";
import { detectImageType } from "./avatars";
import { STORAGE_KEY } from "./backup";

const sql = new DB().sqlite;
const utils = new Utils();

const DEFAULT_MAX_MB = 25;
// Room for the form's other fields and the multipart boundaries around the file.
const FORM_OVERHEAD_BYTES = 64 * 1024;
const MAX_NAME_LENGTH = 200;
// A file without a row this old is left over from a crash or a race, since a
// finished upload gets its row within moments.
const ORPHAN_AGE_MS = 60 * 60 * 1000;
// Header the web app sends with an upload. A page on another site can't add it
// without a CORS preflight, which this route never approves.
export const UPLOAD_HEADER = "x-smelp-upload";

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
			// Control characters, including C1, and the ones that reorder text.
			return !(
				code < 0x20 ||
				(code >= 0x7f && code <= 0x9f) ||
				code === 0x200e ||
				code === 0x200f ||
				(code >= 0x202a && code <= 0x202e) ||
				(code >= 0x2066 && code <= 0x2069)
			);
		})
		.join("")
		.trim()
		.replace(/^\.+/, "")
		.slice(0, MAX_NAME_LENGTH)
		.trim();
	return cleaned || "file";
}

// encodeURIComponent leaves ' ( ) * alone, which RFC 5987 doesn't allow unescaped.
const encodeFileName = (name: string) =>
	encodeURIComponent(name).replace(
		/['()*]/g,
		(character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
	);

const INLINE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

const fail = (status: number, message: string) =>
	new Response(message, { status });

const tooLarge = (limit: number) =>
	fail(
		413,
		`That file is too large. The limit is ${Math.floor(limit / 1024 / 1024)} MB.`,
	);

// Only the first bytes are read. The types in use here don't list Blob's slice.
const headOf = (file: File) =>
	(file as unknown as { slice(start: number, end: number): Blob }).slice(0, 16);

class BodyTooLarge extends Error {}

// Parses the form while counting bytes, so a body that outgrows the limit is cut off
// instead of being buffered in full.
function readForm(request: Request, maxBytes: number) {
	if (!request.body) throw new Error("No body");
	let seen = 0;
	const counted = request.body.pipeThrough(
		new TransformStream<Uint8Array, Uint8Array>({
			transform(chunk, controller) {
				seen += chunk.byteLength;
				if (seen > maxBytes) throw new BodyTooLarge();
				controller.enqueue(chunk);
			},
		}),
	);
	return new Response(counted, {
		headers: { "content-type": request.headers.get("content-type") ?? "" },
	}).formData();
}

function failure(error: unknown) {
	if (error instanceof ORPCError) return fail(error.status, error.message);
	throw error;
}

export async function uploadAttachment(request: Request) {
	try {
		if (request.method !== "POST") return fail(405, "Method not allowed");

		if (request.headers.get(UPLOAD_HEADER) !== "1") {
			return fail(403, "Uploads must come from the smelp web app");
		}
		const site = request.headers.get("sec-fetch-site");
		if (site && site !== "same-origin" && site !== "none") {
			return fail(403, "Uploads must come from the smelp web app");
		}

		// Browsers always say how big a form upload is. Without it the size can't be
		// checked up front, and a chunked body would be buffered before any limit applied.
		const limit = maxAttachmentBytes();
		const declaredHeader = request.headers.get("content-length");
		const declared = Number(declaredHeader);
		if (
			declaredHeader === null ||
			!Number.isInteger(declared) ||
			declared < 0
		) {
			return fail(411, "The upload's size is missing");
		}
		if (declared > limit + FORM_OVERHEAD_BYTES) return tooLarge(limit);

		// Everything is checked before the body is read, so a refused upload is cheap.
		const url = new URL(request.url);
		const issueId = url.searchParams.get("issueId");
		if (!issueId) return fail(400, "Missing work item");
		// Before the lookup, so a visitor can't tell which work items exist.
		await requireUser(request.headers);
		const issue = (await sql`SELECT * FROM issue WHERE id = ${issueId}`)[0] as
			| tables["issue"]
			| undefined;
		if (!issue) return fail(404, "Work item not found");
		const { caller } = await requireProjectPermission(
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
			if (comment.authorId !== caller.userId) {
				return fail(403, "Only the author can attach files to a comment");
			}
		}

		// The declared size could be a lie, so what actually arrives is counted too.
		let file: unknown;
		try {
			file = (await readForm(request, limit + FORM_OVERHEAD_BYTES)).get("file");
		} catch (error) {
			if (error instanceof BodyTooLarge) return tooLarge(limit);
			return fail(400, "Expected a file upload");
		}
		if (!(file instanceof File)) return fail(400, "No file was sent");
		if (file.size > limit) return tooLarge(limit);

		const detected = detectImageType(
			new Uint8Array(await headOf(file).arrayBuffer()),
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
			uploaderId: caller.userId,
			name: cleanFileName(file.name),
			size: file.size,
			contentType,
			storageKey: crypto.randomUUID(),
			createdAt: Date.now(),
		};

		mkdirSync(attachmentsPath(), { recursive: true, mode: 0o700 });
		try {
			const stored = fileFor(attachment.storageKey);
			await Bun.write(stored, file);
			// Bun.write ignores a mode on some versions, so it's set afterwards.
			await chmod(stored, 0o600);
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
			actorId: caller.userId,
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

export async function attachmentResponse(
	headers: Headers,
	id: string,
	method = "GET",
) {
	try {
		if (method !== "GET" && method !== "HEAD") {
			return fail(405, "Method not allowed");
		}
		const attachment = (
			await sql`SELECT * FROM attachment WHERE id = ${id}`
		)[0] as tables["attachment"] | undefined;
		if (!attachment) {
			// Signed-out visitors learn nothing about what exists.
			await requireUser(headers);
			return fail(404, "Not found");
		}
		await requireIssueRead(headers, attachment.issueId);

		const file = Bun.file(fileFor(attachment.storageKey));
		if (!(await file.exists())) return fail(404, "The file is missing");

		const inline = INLINE_TYPES.has(attachment.contentType);
		const fallback = attachment.name.replace(/[^\x20-\x7e]|["\\%]/g, "_");
		return new Response(file, {
			headers: {
				"Content-Type": inline
					? attachment.contentType
					: "application/octet-stream",
				"Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${fallback}"; filename*=UTF-8''${encodeFileName(attachment.name)}`,
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

// Removes files nothing refers to, such as after a crash between writing a file and
// saving its row, or after restoring an older backup. Anything recent is left alone,
// because it may be an upload in progress.
export async function sweepAttachments(now = Date.now()) {
	let names: string[];
	try {
		names = readdirSync(attachmentsPath());
	} catch {
		return 0;
	}
	const candidates = names.filter((name) => {
		if (!STORAGE_KEY.test(name)) return false;
		try {
			const stats = statSync(path.join(attachmentsPath(), name));
			return stats.isFile() && now - stats.mtimeMs > ORPHAN_AGE_MS;
		} catch {
			return false;
		}
	});
	if (candidates.length === 0) return 0;

	const known = new Set(
		(
			(await sql`SELECT storageKey FROM attachment`) as Pick<
				tables["attachment"],
				"storageKey"
			>[]
		).map((row) => row.storageKey),
	);
	const orphans = candidates.filter((name) => !known.has(name));
	await removeAttachmentFiles(orphans);
	return orphans.length;
}
