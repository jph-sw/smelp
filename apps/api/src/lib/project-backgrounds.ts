import { ORPCError } from "@orpc/server";
import { DB, type tables } from "@smelp/db";
import { requireProjectPermission } from "./access";

const sql = new DB().sqlite;

export const MAX_BACKGROUND_BYTES = 1024 * 1024;

export async function projectBackgroundResponse(
	headers: Headers,
	projectId: string,
) {
	try {
		await requireProjectPermission(headers, projectId, "space:read");
	} catch (error) {
		if (error instanceof ORPCError) {
			return new Response(error.message, { status: error.status });
		}
		throw error;
	}

	const background = (
		await sql`SELECT contentType, data FROM project_background WHERE projectId = ${projectId}`
	)[0] as
		| Pick<tables["project_background"], "contentType" | "data">
		| undefined;
	if (!background) return new Response("Not found", { status: 404 });

	return new Response(new Uint8Array(background.data), {
		headers: {
			"Content-Type": background.contentType,
			"X-Content-Type-Options": "nosniff",
			// The address changes with each upload, so a cached copy never goes stale.
			"Cache-Control": "private, max-age=31536000, immutable",
		},
	});
}
