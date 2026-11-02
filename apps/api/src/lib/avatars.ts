import { getCookie } from "@orpc/server/helpers";
import { Auth } from "@smelp/auth";
import { DB, type tables } from "@smelp/db";

const sql = new DB().sqlite;
const auth = new Auth();

export const MAX_AVATAR_BYTES = 256 * 1024;

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
	signature.every((byte, index) => bytes[offset + index] === byte);

// Decides the type from the bytes, never from what the client claims, and only
// allows formats a browser can't run as a document (so no SVG or HTML).
export function detectImageType(bytes: Uint8Array) {
	if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
		return "image/png";
	}
	if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
	if (
		startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
		startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
	) {
		return "image/webp";
	}
	return null;
}

export async function avatarResponse(headers: Headers, userId: string) {
	const token = getCookie(headers, "auth_session");
	const session = token ? await auth.validateAuthSessionToken(token) : null;
	if (!session) return new Response("Unauthorized", { status: 401 });

	const avatar = (
		await sql`SELECT contentType, data FROM auth_user_avatar WHERE userId = ${userId}`
	)[0] as Pick<tables["auth_user_avatar"], "contentType" | "data"> | undefined;
	if (!avatar) return new Response("Not found", { status: 404 });

	return new Response(new Uint8Array(avatar.data), {
		headers: {
			"Content-Type": avatar.contentType,
			"X-Content-Type-Options": "nosniff",
			// The address changes with each upload, so a cached copy never goes stale.
			"Cache-Control": "private, max-age=31536000, immutable",
		},
	});
}
