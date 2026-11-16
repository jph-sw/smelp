import { ORPCError } from "@orpc/server";
import { Auth } from "@smelp/auth";
import { DB, type tables, Utils } from "@smelp/db";
import { eventBus } from "@smelp/events";
import { SQL } from "bun";
import * as v from "valibot";
import { requireUser, requireWorkspacePermission } from "../lib/access";
import {
	attachmentKeysOfWorkspace,
	removeAttachmentFiles,
} from "../lib/attachments";
import { requireVerifiedEmail } from "../lib/email-verification";
import { base } from "../orpc";

const sql = new DB().sqlite;
const utils = new Utils();
const auth = new Auth();

// Workspace ids are slugs of the name and live at the top level of the URL, so
// they can't take a path the app or its backend already uses.
const RESERVED_WORKSPACE_IDS = new Set([
	"account",
	"api",
	"ceo",
	"create_workspace",
	"invite",
	"invites",
	"rpc",
	"signin",
	"signup",
	"verify-email",
]);

export const findWorkspace = base
	.input(v.object({ workspaceId: v.string() }))
	.handler(async ({ input, context }) => {
		const { workspace, access } = await requireWorkspacePermission(
			context.headers,
			input.workspaceId,
			"space:read",
			{ public: true },
		);

		// Tells the app whether to offer what only members can use.
		return { ...workspace, viewerAccess: access.kind };
	});

export const updateWorkspace = base
	.input(
		v.object({
			workspaceId: v.string(),
			name: v.optional(
				v.pipe(v.string(), v.trim(), v.minLength(2), v.maxLength(32)),
			),
			// Can be set while the instance keeps public access off. It only starts
			// to matter once an instance admin turns that on.
			public: v.optional(v.boolean()),
		}),
	)
	.handler(async ({ input, context }) => {
		const { workspace } = await requireWorkspacePermission(
			context.headers,
			input.workspaceId,
			"space:update",
		);

		const name = input.name ?? workspace.name;
		const isPublic =
			input.public === undefined ? workspace.public : Number(input.public);
		await sql`
			UPDATE workspace SET name = ${name}, public = ${isPublic}
			WHERE id = ${input.workspaceId}
		`;

		return (
			await sql`SELECT * FROM workspace WHERE id = ${input.workspaceId}`
		)[0] as tables["workspace"];
	});

export const deleteWorkspace = base
	.input(v.object({ workspaceId: v.string() }))
	.handler(async ({ input, context }) => {
		const caller = await requireUser(context.headers);

		const workspace = (
			await sql`SELECT * FROM workspace WHERE id = ${input.workspaceId}`
		)[0] as tables["workspace"];

		if (!workspace) {
			throw new ORPCError("NOT_FOUND");
		}

		const allowed = await auth.userHasPermission(
			caller.userId,
			workspace.spaceId,
			"space:delete",
		);
		if (!allowed) {
			throw new ORPCError("FORBIDDEN");
		}
		const projects = (await sql`
			SELECT id, spaceId FROM project WHERE workspaceId = ${workspace.id}
		`) as tables["project"][];

		const files = await attachmentKeysOfWorkspace(workspace.id);
		await sql.begin(async (tx) => {
			for (const project of projects) {
				await tx`DELETE FROM auth_space WHERE id = ${project.spaceId}`;
			}

			// deleting the workspace's space cascades to workspace, activity_logs,
			// auth_space_member, and auth_space_invite
			await tx`DELETE FROM auth_space WHERE id = ${workspace.spaceId}`;
		});
		await removeAttachmentFiles(files);

		eventBus.emit({
			type: "workspace.deleted",
			workspaceId: workspace.id,
			actorId: caller.userId,
			entityId: "",
			payload: {
				name: workspace.name,
			},
		});

		return { success: true };
	});

export const createWorkspace = base
	.input(
		v.object({
			name: v.pipe(v.string(), v.trim(), v.minLength(2), v.maxLength(32)),
		}),
	)
	.handler(async ({ input, context }) => {
		const caller = await requireUser(context.headers);

		await requireVerifiedEmail(caller.userId);

		const slug = utils.toSlug(input.name);
		if (!slug) {
			throw new ORPCError("BAD_REQUEST", {
				message:
					"Workspace names need at least one letter or number (a-z, 0-9).",
			});
		}
		if (RESERVED_WORKSPACE_IDS.has(slug)) {
			throw new ORPCError("BAD_REQUEST", {
				message: "This workspace name isn't available.",
			});
		}

		const now = Date.now();

		const auth_space: tables["auth_space"] = {
			id: slug,
			name: input.name,
			ownerId: caller.userId,
			createdAt: now,
			updatedAt: now,
		};

		const auth_space_member: tables["auth_space_member"] = {
			id: crypto.randomUUID(),
			spaceId: auth_space.id,
			userId: caller.userId,
			role: "admin",
			createdAt: now,
		};

		const workspace: tables["workspace"] = {
			id: slug,
			name: input.name,
			ownerId: caller.userId,
			spaceId: auth_space.id,
			image: null,
			public: 0,
		};

		try {
			await sql.begin(async (tx) => {
				await tx`INSERT INTO auth_space ${tx(auth_space)}`;
				await tx`INSERT INTO auth_space_member ${tx(auth_space_member)}`;
				await tx`INSERT INTO workspace ${tx(workspace)}`;
			});
		} catch (e) {
			if (e instanceof SQL.SQLiteError) {
				if (e.code === "SQLITE_CONSTRAINT_PRIMARYKEY") {
					throw new ORPCError("CONFLICT", {
						message: "A workspace with this name already exists",
					});
				}
			}
			throw e;
		}

		eventBus.emit({
			type: "workspace.created",
			workspaceId: workspace.id,
			actorId: workspace.ownerId,
			entityId: "",
			payload: {
				name: workspace.name,
			},
		});

		return workspace;
	});
