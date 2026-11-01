import { ORPCError } from "@orpc/server";
import { getCookie } from "@orpc/server/helpers";
import { Auth } from "@smelp/auth";
import { DB, type tables } from "@smelp/db";

const sql = new DB().sqlite;
const auth = new Auth();

type Permission = Parameters<Auth["userHasPermission"]>[2];

export async function requireSession(headers: Headers) {
	const token = getCookie(headers, "auth_session");
	if (!token) throw new ORPCError("UNAUTHORIZED");

	const session = await auth.validateAuthSessionToken(token);
	if (!session) throw new ORPCError("UNAUTHORIZED");

	return session;
}

export async function requireInstanceAdmin(headers: Headers) {
	const session = await requireSession(headers);
	if (!(await auth.isInstanceAdmin(session.userId))) {
		throw new ORPCError("FORBIDDEN");
	}
	return session;
}

export async function requireProjectPermission(
	headers: Headers,
	projectId: string,
	permission: Permission,
) {
	const session = await requireSession(headers);

	const project = (
		await sql`SELECT * FROM project WHERE id = ${projectId}`
	)[0] as tables["project"] | undefined;
	if (!project) throw new ORPCError("NOT_FOUND");

	const allowed = await auth.userHasPermission(
		session.userId,
		project.spaceId,
		permission,
	);
	if (!allowed) throw new ORPCError("FORBIDDEN");

	return { session, project };
}

export async function requireWorkspacePermission(
	headers: Headers,
	workspaceId: string,
	permission: Permission,
) {
	const session = await requireSession(headers);

	const workspace = (
		await sql`SELECT * FROM workspace WHERE id = ${workspaceId}`
	)[0] as tables["workspace"] | undefined;
	if (!workspace) throw new ORPCError("NOT_FOUND");

	const allowed = await auth.userHasPermission(
		session.userId,
		workspace.spaceId,
		permission,
	);
	if (!allowed) throw new ORPCError("FORBIDDEN");

	return { session, workspace };
}
