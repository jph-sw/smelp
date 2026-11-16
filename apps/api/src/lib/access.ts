import { ORPCError } from "@orpc/server";
import { getCookie } from "@orpc/server/helpers";
import { Auth } from "@smelp/auth";
import { DB, type tables } from "@smelp/db";
import { hashSecretToken } from "./tokens";

const sql = new DB().sqlite;
const auth = new Auth();

type Permission = Parameters<Auth["userHasPermission"]>[2];

export const API_TOKEN_PREFIX = "smelp_";

const LAST_USED_PRECISION_MS = 60 * 60 * 1000;

type Caller = { userId: string };

// Browser sign-in only. Account security (password, linked accounts, tokens) and
// instance administration stay behind it, so a leaked API token can't take them over.
export async function requireSession(headers: Headers) {
	const token = getCookie(headers, "auth_session");
	if (!token) throw new ORPCError("UNAUTHORIZED");

	const session = await auth.validateAuthSessionToken(token);
	if (!session) throw new ORPCError("UNAUTHORIZED");

	return session;
}

/** The person making the call, from an API token or else the browser session. */
export async function requireUser(headers: Headers): Promise<Caller> {
	const authorization = headers.get("authorization");
	if (authorization === null) {
		const { userId } = await requireSession(headers);
		return { userId };
	}

	const token = authorization.slice("Bearer ".length);
	if (
		!authorization.startsWith("Bearer ") ||
		!token.startsWith(API_TOKEN_PREFIX)
	) {
		throw new ORPCError("UNAUTHORIZED");
	}

	const now = Date.now();
	const row = (
		await sql`
			SELECT id, userId, lastUsedAt FROM api_token
			WHERE secretHash = ${hashSecretToken(token)}
			  AND (expiresAt IS NULL OR expiresAt > ${now})
		`
	)[0] as Pick<tables["api_token"], "id" | "userId" | "lastUsedAt"> | undefined;
	if (!row) throw new ORPCError("UNAUTHORIZED");

	if (
		row.lastUsedAt === null ||
		now - row.lastUsedAt >= LAST_USED_PRECISION_MS
	) {
		await sql`UPDATE api_token SET lastUsedAt = ${now} WHERE id = ${row.id}`;
	}

	return { userId: row.userId };
}

export async function requireInstanceAdmin(headers: Headers) {
	const session = await requireSession(headers);
	if (!(await auth.isInstanceAdmin(session.userId))) {
		throw new ORPCError("FORBIDDEN");
	}
	return session;
}

// Permissions that only look at a project. Asking for any other permission means
// the caller is about to change something, which an archived project refuses.
const READ_PERMISSIONS: readonly Permission[] = ["space:read", "content:read"];

export function requireNotArchived(project: tables["project"]) {
	if (project.archivedAt !== null) {
		throw new ORPCError("FORBIDDEN", { message: "This project is archived" });
	}
}

type ProjectAccessOptions = {
	/** Treat the call as a write even though `permission` is a read one
	 *  (e.g. guests may comment, which only needs `space:read`). */
	write?: boolean;
	/** Let the call through on an archived project (archive, unarchive, delete). */
	allowArchived?: boolean;
};

export async function requireProjectPermission(
	headers: Headers,
	projectId: string,
	permission: Permission,
	options: ProjectAccessOptions = {},
) {
	const caller = await requireUser(headers);

	const project = (
		await sql`SELECT * FROM project WHERE id = ${projectId}`
	)[0] as tables["project"] | undefined;
	if (!project) throw new ORPCError("NOT_FOUND");

	const allowed = await auth.userHasPermission(
		caller.userId,
		project.spaceId,
		permission,
	);
	if (!allowed) throw new ORPCError("FORBIDDEN");

	const writes = options.write ?? !READ_PERMISSIONS.includes(permission);
	if (writes && !options.allowArchived) requireNotArchived(project);

	return { caller, project };
}

export async function requireWorkspacePermission(
	headers: Headers,
	workspaceId: string,
	permission: Permission,
) {
	const caller = await requireUser(headers);

	const workspace = (
		await sql`SELECT * FROM workspace WHERE id = ${workspaceId}`
	)[0] as tables["workspace"] | undefined;
	if (!workspace) throw new ORPCError("NOT_FOUND");

	const allowed = await auth.userHasPermission(
		caller.userId,
		workspace.spaceId,
		permission,
	);
	if (!allowed) throw new ORPCError("FORBIDDEN");

	return { caller, workspace };
}
