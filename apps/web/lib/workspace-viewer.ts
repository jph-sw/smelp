import type { tables } from "@smelp/db";
import { redirect, useRouteContext } from "@tanstack/react-router";
import type { AuthUser } from "./auth";
import type { orpc } from "./orpc";

type ViewerAccess = Awaited<
	ReturnType<typeof orpc.workspace.find>
>["viewerAccess"];

// How the person on a workspace page stands toward it. "public" is anyone who
// reads a public workspace from outside, signed in or not, and only ever reads.
export type WorkspaceViewer =
	| { mode: "instanceAdmin"; user: AuthUser }
	| {
			mode: "member";
			user: AuthUser;
			role: tables["auth_space_member"]["role"];
	  }
	| { mode: "public"; user: AuthUser | null };

export function toWorkspaceViewer(
	access: ViewerAccess,
	user: AuthUser | null,
	members: Pick<tables["auth_space_member"], "userId" | "role">[],
): WorkspaceViewer {
	if (access === "public" || user == null) return { mode: "public", user };
	if (access === "instanceAdmin") return { mode: "instanceAdmin", user };
	const role =
		members.find((member) => member.userId === user.id)?.role ?? "guest";
	return { mode: "member", user, role };
}

// The API enforces these rules too; this only decides which controls to show.
export function workspacePermissions(viewer: WorkspaceViewer) {
	const canManage =
		viewer.mode === "instanceAdmin" ||
		(viewer.mode === "member" && viewer.role === "admin");
	return {
		canManage,
		canWrite:
			canManage || (viewer.mode === "member" && viewer.role === "member"),
	};
}

// What the person on the page can do in a project, given their role in it.
export function projectPermissions(
	viewer: WorkspaceViewer,
	role: tables["auth_space_member"]["role"] | undefined,
	project: Pick<tables["project"], "archivedAt">,
) {
	const isInstanceAdmin = viewer.mode === "instanceAdmin";
	const isArchived = project.archivedAt !== null;
	return {
		isArchived,
		// An archived project is read-only for everyone, admins included.
		canWrite:
			!isArchived && (isInstanceAdmin || role === "member" || role === "admin"),
		// Includes archive, unarchive and delete, which still work while archived.
		canManage: isInstanceAdmin || role === "admin",
		// Guests may comment too. Someone reading from outside may not.
		canComment: !isArchived && (isInstanceAdmin || role !== undefined),
		// Someone outside the project reads it only because it's public, and any
		// workspace member who can write may join a public project.
		canJoin:
			!isArchived &&
			role === undefined &&
			viewer.mode === "member" &&
			viewer.role !== "guest",
	};
}

export function useWorkspaceViewer() {
	return useRouteContext({
		from: "/(workspace)/$id",
		select: (context) => context.viewer,
	});
}

export function useWorkspaceAccess() {
	const viewer = useWorkspaceViewer();
	return { viewer, ...workspacePermissions(viewer) };
}

// For pages only members can use. Someone reading from outside is sent to sign in,
// or, already signed in, back to what they can read.
export function requireMemberViewer(
	viewer: WorkspaceViewer,
	workspaceId: string,
	href: string,
) {
	if (viewer.mode !== "public") return;
	throw viewer.user
		? redirect({ to: "/$id", params: { id: workspaceId } })
		: redirect({ to: "/signin", search: { redirect: href } });
}
