import { ORPCError } from "@orpc/server";
import { getCookie } from "@orpc/server/helpers";
import { Auth, type Permission, roleHasPermission } from "@smelp/auth";
import { DB, type tables } from "@smelp/db";
import { isInstancePublic } from "./instance";
import { hashSecretToken } from "./tokens";

const sql = new DB().sqlite;
const auth = new Auth();

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

/** Who is asking. Reading what's public needs no account, so a visitor is a viewer too. */
export type Viewer = { kind: "user"; userId: string } | { kind: "anonymous" };

async function userOfApiToken(authorization: string): Promise<Caller> {
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
			  AND (secretExpiresAt IS NULL OR secretExpiresAt > ${now})
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

// A token that doesn't work is refused, because whoever sent it meant to be someone.
// A session cookie that no longer works only makes its browser a visitor: an old
// cookie shouldn't lock anyone out of what they could read without one.
export async function resolveViewer(headers: Headers): Promise<Viewer> {
	const authorization = headers.get("authorization");
	if (authorization !== null) {
		const { userId } = await userOfApiToken(authorization);
		return { kind: "user", userId };
	}

	const token = getCookie(headers, "auth_session");
	const session = token ? await auth.validateAuthSessionToken(token) : null;
	return session
		? { kind: "user", userId: session.userId }
		: { kind: "anonymous" };
}

/** The person making the call, from an API token or else the browser session. */
export async function requireUser(headers: Headers): Promise<Caller> {
	const viewer = await resolveViewer(headers);
	if (viewer.kind === "anonymous") throw new ORPCError("UNAUTHORIZED");
	return { userId: viewer.userId };
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
const READ_PERMISSIONS = ["space:read", "content:read"] as const;
type ReadPermission = (typeof READ_PERMISSIONS)[number];

const isRead = (permission: Permission): permission is ReadPermission =>
	(READ_PERMISSIONS as readonly Permission[]).includes(permission);

export function requireNotArchived(project: tables["project"]) {
	if (project.archivedAt !== null) {
		throw new ORPCError("FORBIDDEN", { message: "This project is archived" });
	}
}

/*
  How a viewer stands toward a project or workspace. Members and instance admins
  get what their role allows. Anyone else, signed in or not, gets "public" while
  three switches agree: the instance allows public access, the workspace is public,
  and (for a project) its own access is "public". "public" only ever reads.
*/
type Membership =
	| { kind: "instanceAdmin" }
	| { kind: "member"; role: tables["auth_space_member"]["role"] };

export type Access = Membership | { kind: "public" } | { kind: "none" };
export type ReadAccess = Exclude<Access, { kind: "none" }>;

async function membership(
	viewer: Viewer,
	spaceId: string,
): Promise<Membership | null> {
	if (viewer.kind === "anonymous") return null;
	if (await auth.isInstanceAdmin(viewer.userId)) {
		return { kind: "instanceAdmin" };
	}
	const member = (
		await sql`
			SELECT role FROM auth_space_member
			WHERE spaceId = ${spaceId} AND userId = ${viewer.userId}
		`
	)[0] as Pick<tables["auth_space_member"], "role"> | undefined;
	return member ? { kind: "member", role: member.role } : null;
}

export async function workspaceAccess(
	viewer: Viewer,
	workspace: tables["workspace"],
): Promise<Access> {
	const member = await membership(viewer, workspace.spaceId);
	if (member) return member;
	const open = workspace.public === 1 && (await isInstancePublic());
	return { kind: open ? "public" : "none" };
}

export async function projectAccess(
	viewer: Viewer,
	project: tables["project"],
	workspace: tables["workspace"],
): Promise<Access> {
	const member = await membership(viewer, project.spaceId);
	if (member) return member;
	const open =
		project.access === "public" &&
		workspace.public === 1 &&
		(await isInstancePublic());
	return { kind: open ? "public" : "none" };
}

type GateOptions = {
	/** Treat the call as a write even though `permission` is a read one
	 *  (e.g. guests may comment, which only needs `space:read`). */
	write?: boolean;
	/** Let the call through on an archived project (archive, unarchive, delete). */
	allowArchived?: boolean;
	/** Let anyone read who the project or workspace is public for, not only members.
	 *  Each read that a visitor may make opts in, so new reads stay members-only. */
	public?: boolean;
};

/** A read that a visitor may make: no write, and nothing about archiving applies. */
type PublicRead = { public: true };

function allows(access: Access, permission: Permission, options: GateOptions) {
	switch (access.kind) {
		case "instanceAdmin":
			return true;
		case "member":
			return roleHasPermission(access.role, permission);
		case "public":
			return options.public === true && isRead(permission) && !options.write;
		case "none":
			return false;
	}
}

// A visitor is asked to sign in whether or not the thing exists, so nobody without
// an account can probe for what a private workspace holds.
function refusal(viewer: Viewer, code: "NOT_FOUND" | "FORBIDDEN") {
	return new ORPCError(viewer.kind === "anonymous" ? "UNAUTHORIZED" : code);
}

async function findProject(projectId: string) {
	const project = (
		await sql`SELECT * FROM project WHERE id = ${projectId}`
	)[0] as tables["project"] | undefined;
	if (!project) return null;
	const workspace = (
		await sql`SELECT * FROM workspace WHERE id = ${project.workspaceId}`
	)[0] as tables["workspace"];
	return { project, workspace };
}

export function requireProjectPermission(
	headers: Headers,
	projectId: string,
	permission: ReadPermission,
	options: PublicRead,
): Promise<{
	viewer: Viewer;
	access: ReadAccess;
	project: tables["project"];
}>;
export function requireProjectPermission(
	headers: Headers,
	projectId: string,
	permission: Permission,
	options?: Omit<GateOptions, "public">,
): Promise<{
	viewer: Viewer;
	caller: Caller;
	access: Membership;
	project: tables["project"];
}>;
export async function requireProjectPermission(
	headers: Headers,
	projectId: string,
	permission: Permission,
	options: GateOptions = {},
): Promise<{
	viewer: Viewer;
	caller?: Caller;
	access: Access;
	project: tables["project"];
}> {
	const viewer = await resolveViewer(headers);
	const found = await findProject(projectId);
	if (!found) throw refusal(viewer, "NOT_FOUND");
	const { project, workspace } = found;

	const access = await projectAccess(viewer, project, workspace);
	if (!allows(access, permission, options)) throw refusal(viewer, "FORBIDDEN");

	const writes = options.write ?? !isRead(permission);
	if (writes && !options.allowArchived) requireNotArchived(project);

	const caller = viewer.kind === "user" ? { userId: viewer.userId } : undefined;
	return { viewer, caller, access, project };
}

export function requireWorkspacePermission(
	headers: Headers,
	workspaceId: string,
	permission: ReadPermission,
	options: PublicRead,
): Promise<{
	viewer: Viewer;
	access: ReadAccess;
	workspace: tables["workspace"];
}>;
export function requireWorkspacePermission(
	headers: Headers,
	workspaceId: string,
	permission: Permission,
): Promise<{
	viewer: Viewer;
	caller: Caller;
	access: Membership;
	workspace: tables["workspace"];
}>;
export async function requireWorkspacePermission(
	headers: Headers,
	workspaceId: string,
	permission: Permission,
	options: GateOptions = {},
): Promise<{
	viewer: Viewer;
	caller?: Caller;
	access: Access;
	workspace: tables["workspace"];
}> {
	const viewer = await resolveViewer(headers);
	const workspace = (
		await sql`SELECT * FROM workspace WHERE id = ${workspaceId}`
	)[0] as tables["workspace"] | undefined;
	if (!workspace) throw refusal(viewer, "NOT_FOUND");

	const access = await workspaceAccess(viewer, workspace);
	if (!allows(access, permission, options)) throw refusal(viewer, "FORBIDDEN");

	const caller = viewer.kind === "user" ? { userId: viewer.userId } : undefined;
	return { viewer, caller, access, workspace };
}

/** Reading a work item, for anyone its project is public for. */
export async function requireIssueRead(headers: Headers, issueId: string) {
	const issue = (await sql`SELECT * FROM issue WHERE id = ${issueId}`)[0] as
		| tables["issue"]
		| undefined;
	if (!issue) {
		throw refusal(await resolveViewer(headers), "NOT_FOUND");
	}
	const read = await requireProjectPermission(
		headers,
		issue.projectId,
		"space:read",
		{ public: true },
	);
	return { issue, ...read };
}

/** Whether the viewer could read the project, for filtering lists that point into it. */
export async function canReadProject(viewer: Viewer, projectId: string) {
	const found = await findProject(projectId);
	if (!found) return false;
	const access = await projectAccess(viewer, found.project, found.workspace);
	return allows(access, "space:read", { public: true });
}

// The same three switches as projectAccess, asked about a person: a visitor sees a
// picture only for someone who is on a board the visitor could open.
export async function isOnPublicBoard(userId: string) {
	if (!(await isInstancePublic())) return false;
	const membership = (
		await sql`
			SELECT 1 FROM auth_space_member
			JOIN project ON project.spaceId = auth_space_member.spaceId
			JOIN workspace ON workspace.id = project.workspaceId
			WHERE auth_space_member.userId = ${userId}
				AND project.access = 'public'
				AND workspace.public = 1
			LIMIT 1
		`
	)[0];
	return membership !== undefined;
}
