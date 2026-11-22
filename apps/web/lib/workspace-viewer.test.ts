import { describe, expect, test } from "bun:test";
import { projectPermissions, type WorkspaceViewer } from "./workspace-viewer";

const user = { id: "carl" } as Extract<
	WorkspaceViewer,
	{ user: object }
>["user"];
const open = { archivedAt: null };
const archived = { archivedAt: 1 };

const workspaceMember: WorkspaceViewer = {
	mode: "member",
	user,
	role: "member",
};
const workspaceGuest: WorkspaceViewer = { mode: "member", user, role: "guest" };
const instanceAdmin: WorkspaceViewer = { mode: "instanceAdmin", user };
const visitor: WorkspaceViewer = { mode: "public", user };

describe("projectPermissions", () => {
	test("anyone with a project role comments, guests included", () => {
		for (const role of ["guest", "member", "admin"] as const) {
			expect(projectPermissions(workspaceMember, role, open).canComment).toBe(
				true,
			);
		}
		expect(projectPermissions(instanceAdmin, undefined, open).canComment).toBe(
			true,
		);
	});

	test("nobody outside the project comments", () => {
		for (const viewer of [workspaceMember, workspaceGuest, visitor]) {
			expect(projectPermissions(viewer, undefined, open).canComment).toBe(
				false,
			);
		}
	});

	test("a workspace member outside the project can join it, and nobody else", () => {
		expect(projectPermissions(workspaceMember, undefined, open).canJoin).toBe(
			true,
		);
		expect(projectPermissions(workspaceMember, "guest", open).canJoin).toBe(
			false,
		);
		expect(projectPermissions(workspaceGuest, undefined, open).canJoin).toBe(
			false,
		);
		expect(projectPermissions(instanceAdmin, undefined, open).canJoin).toBe(
			false,
		);
		expect(projectPermissions(visitor, undefined, open).canJoin).toBe(false);
	});

	test("an archived project takes no comments and no new members", () => {
		const access = projectPermissions(workspaceMember, undefined, archived);
		expect(access.canJoin).toBe(false);
		expect(
			projectPermissions(workspaceMember, "member", archived).canComment,
		).toBe(false);
	});
});
