import { Auth } from "@smelp/auth";
import { DB, type tables } from "@smelp/db";
import * as v from "valibot";
import { requireWorkspacePermission } from "../lib/access";
import { base } from "../orpc";

const sql = new DB().sqlite;
const auth = new Auth();

const PAGE_SIZE = 50;

// Older rows stored a short action for these; everything else stores the event type.
const LEGACY_ACTIONS: Record<string, string> = {
	created: "issue.created",
	status_changed: "issue.status_changed",
	assigned: "issue.assigned",
	commented: "comment.created",
};

type FeedRow = Pick<
	tables["activity_logs"],
	| "id"
	| "entityType"
	| "entityId"
	| "action"
	| "actorId"
	| "field"
	| "oldValue"
	| "newValue"
	| "metadata"
	| "createdAt"
> & {
	actorName: string | null;
	actorImage: string | null;
	projectKey: string | null;
	projectName: string | null;
	issueTitle: string | null;
	issueExists: number;
	oldStateName: string | null;
	newStateName: string | null;
	oldUserName: string | null;
	newUserName: string | null;
	memberUserId: string | null;
	memberUserName: string | null;
};

export type FeedDetails = {
	name?: string | null;
	oldName?: string | null;
	from?: string | null;
	to?: string | null;
	field?: string | null;
	group?: string | null;
	access?: string | null;
	changes?: string[];
	movedToName?: string | null;
	userId?: string | null;
	userName?: string | null;
	role?: string | null;
	email?: string | null;
};

export type FeedEvent = {
	id: string;
	type: string;
	createdAt: number;
	actorId: string | null;
	actorName: string | null;
	actorImage: string | null;
	project: { id: string; name: string | null; exists: boolean } | null;
	issue: { id: string; title: string | null; exists: boolean } | null;
	details: FeedDetails;
};

const Cursor = v.object({
	createdAt: v.pipe(v.number(), v.integer()),
	id: v.string(),
});

function parseMetadata(metadata: string | null): Record<string, unknown> {
	if (!metadata) return {};
	try {
		const parsed: unknown = JSON.parse(metadata);
		return parsed && typeof parsed === "object"
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

// Details come from a short list of fields per type, so nothing else that lands
// in a payload, now or later, reaches the feed by accident.
function toFeedEvent(row: FeedRow, canSeeInviteEmails: boolean): FeedEvent {
	const meta = parseMetadata(row.metadata);
	const text = (key: string) => {
		const value = meta[key];
		return typeof value === "string" ? value : null;
	};
	const list = (key: string) => {
		const value = meta[key];
		return Array.isArray(value)
			? value.filter((item): item is string => typeof item === "string")
			: [];
	};
	const type = LEGACY_ACTIONS[row.action] ?? row.action;

	let details: FeedDetails = {};
	switch (type) {
		case "issue.status_changed":
			details = {
				from: text("oldName") ?? row.oldStateName,
				to: text("newName") ?? row.newStateName,
			};
			break;
		case "issue.assigned":
			details = {
				from: row.oldValue ? (text("oldName") ?? row.oldUserName) : null,
				to: row.newValue ? (text("newName") ?? row.newUserName) : null,
			};
			break;
		case "issue.updated":
			details = {
				field: row.field,
				to: row.field === "title" ? row.newValue : null,
			};
			break;
		case "project.created":
		case "project.deleted":
		case "workspace.created":
			details = { name: text("name") };
			break;
		case "project.updated":
			details = {
				name: text("name"),
				oldName: text("oldName"),
				access: text("access"),
				changes: list("changes"),
			};
			break;
		case "state.created":
			details = { name: text("name"), group: text("group") };
			break;
		case "state.updated":
			details = {
				name: text("name"),
				oldName: text("oldName"),
				group: text("group"),
				changes: list("changes"),
			};
			break;
		case "state.deleted":
			details = { name: text("name"), movedToName: text("movedToName") };
			break;
		case "project.member_added":
		case "project.member_removed":
		case "workspace.member_joined":
		case "workspace.member_removed":
			details = {
				userId: row.memberUserId,
				userName: text("userName") ?? row.memberUserName,
				role: text("role"),
			};
			break;
		case "workspace.member_role_changed":
			details = {
				userId: row.memberUserId,
				userName: text("userName") ?? row.memberUserName,
				from: row.oldValue,
				to: row.newValue,
			};
			break;
		case "workspace.member_invited":
			// Invite emails are only listed for people who can invite.
			details = {
				role: text("role"),
				email: canSeeInviteEmails ? text("email") : null,
			};
			break;
	}

	const issueId =
		row.entityType === "issue"
			? row.entityId
			: row.entityType === "comment"
				? text("issueId")
				: null;

	return {
		id: row.id,
		type,
		createdAt: row.createdAt,
		actorId: row.actorId,
		actorName: row.actorName,
		actorImage: row.actorImage,
		project: row.projectKey
			? {
					id: row.projectKey,
					name: row.projectName ?? text("projectName") ?? text("name"),
					exists: row.projectName !== null,
				}
			: null,
		issue: issueId
			? {
					id: issueId,
					title: row.issueTitle ?? text("title"),
					exists: Boolean(row.issueExists),
				}
			: null,
		details,
	};
}

export const findWorkspaceActivity = base
	.input(v.object({ workspaceId: v.string(), before: v.optional(Cursor) }))
	.handler(async ({ input, context }) => {
		const { session, workspace } = await requireWorkspacePermission(
			context.headers,
			input.workspaceId,
			"space:read",
		);
		const userId = session.userId;
		const isInstanceAdmin = await auth.isInstanceAdmin(userId);
		const membership = (
			await sql`SELECT role FROM auth_space_member WHERE spaceId = ${workspace.spaceId} AND userId = ${userId}`
		)[0] as Pick<tables["auth_space_member"], "role"> | undefined;
		const role = membership?.role ?? null;
		// Guests see the projects they've been let into, not who joins or leaves.
		const canSeeMembers =
			isInstanceAdmin || role === "member" || role === "admin";
		const canSeeInviteEmails = isInstanceAdmin || role === "admin";

		const beforeAt = input.before?.createdAt ?? null;
		const beforeId = input.before?.id ?? "";

		// kind says whose rules apply: "project" events follow access to their
		// project, "members" events are for the workspace's members and admins.
		// projectKey finds the project. New events carry its id; older ones get it
		// from the issue, or from the issue id, which is "<projectId>-<n>".
		const rows = (await sql`
			SELECT ev.*, p.name AS projectName
			FROM (
				SELECT
					a.id, a.entityType, a.entityId, a.action, a.actorId,
					a.field, a.oldValue, a.newValue, a.metadata, a.createdAt,
					actor.displayName AS actorName,
					actor.image AS actorImage,
					COALESCE(i.title, ci.title) AS issueTitle,
					(i.id IS NOT NULL OR ci.id IS NOT NULL) AS issueExists,
					oldState.name AS oldStateName,
					newState.name AS newStateName,
					oldUser.displayName AS oldUserName,
					newUser.displayName AS newUserName,
					COALESCE(json_extract(a.metadata, '$.userId'), m.userId) AS memberUserId,
					memberUser.displayName AS memberUserName,
					CASE
						WHEN a.entityType = 'auth' THEN 'hidden'
						WHEN json_extract(a.metadata, '$.projectId') IS NOT NULL
							OR a.entityType IN ('project', 'issue', 'comment', 'state')
							OR (m.spaceId IS NOT NULL AND m.spaceId <> ${workspace.spaceId})
							THEN 'project'
						WHEN a.action IN (
							'workspace.created',
							'workspace.member_invited',
							'workspace.member_role_changed'
						) THEN 'members'
						-- Older join and leave events were also used for projects. One
						-- whose membership is gone can't be told apart, so it stays hidden.
						WHEN a.action IN ('workspace.member_joined', 'workspace.member_removed')
							AND (
								json_type(a.metadata, '$.userName') IS NOT NULL
								OR m.spaceId = ${workspace.spaceId}
							)
							THEN 'members'
						ELSE 'unknown'
					END AS kind,
					CASE
						WHEN json_extract(a.metadata, '$.projectId') IS NOT NULL
							THEN json_extract(a.metadata, '$.projectId')
						WHEN a.entityType = 'project' THEN a.entityId
						WHEN a.entityType = 'issue' THEN COALESCE(
							i.projectId,
							substr(a.entityId, 1, length(rtrim(a.entityId, '0123456789')) - 1)
						)
						WHEN a.entityType = 'comment' THEN COALESCE(
							ci.projectId,
							substr(
								json_extract(a.metadata, '$.issueId'),
								1,
								length(rtrim(json_extract(a.metadata, '$.issueId'), '0123456789')) - 1
							)
						)
						WHEN m.spaceId IS NOT NULL AND m.spaceId <> ${workspace.spaceId}
							THEN (SELECT id FROM project WHERE spaceId = m.spaceId)
					END AS projectKey
				FROM activity_logs a
				LEFT JOIN auth_user actor ON actor.id = a.actorId
				LEFT JOIN issue i ON a.entityType = 'issue' AND i.id = a.entityId
				LEFT JOIN issue ci ON a.entityType = 'comment'
					AND ci.id = json_extract(a.metadata, '$.issueId')
				LEFT JOIN state oldState
					ON a.action = 'status_changed' AND oldState.id = a.oldValue
				LEFT JOIN state newState
					ON a.action = 'status_changed' AND newState.id = a.newValue
				LEFT JOIN auth_user oldUser
					ON a.action = 'assigned' AND oldUser.id = a.oldValue
				LEFT JOIN auth_user newUser
					ON a.action = 'assigned' AND newUser.id = a.newValue
				LEFT JOIN auth_space_member m ON a.entityType = 'workspace'
					AND a.action IN (
						'workspace.member_joined',
						'workspace.member_removed',
						'workspace.member_role_changed'
					)
					AND m.id = a.entityId
				LEFT JOIN auth_user memberUser
					ON memberUser.id = COALESCE(json_extract(a.metadata, '$.userId'), m.userId)
				WHERE a.workspaceId = ${workspace.id}
					AND (
						${beforeAt} IS NULL
						OR a.createdAt < ${beforeAt}
						OR (a.createdAt = ${beforeAt} AND a.id < ${beforeId})
					)
			) ev
			-- A project id can be used again after a delete, so a project only owns
			-- the events from after it was created.
			LEFT JOIN project p ON p.id = ev.projectKey
				AND p.workspaceId = ${workspace.id}
				AND p.createdAt <= ev.createdAt
			WHERE ev.kind <> 'hidden' AND (
				${isInstanceAdmin ? 1 : 0} = 1
				OR (ev.kind = 'members' AND ${canSeeMembers ? 1 : 0} = 1)
				OR (ev.kind = 'project' AND p.id IS NOT NULL AND (
					EXISTS (
						SELECT 1 FROM auth_space_member pm
						WHERE pm.spaceId = p.spaceId AND pm.userId = ${userId}
					)
					-- Everyone in the workspace sees public projects in the list.
					OR (
						ev.action IN ('project.created', 'project.updated')
						AND p.access = 'public'
					)
				))
				-- A deleted project can't be checked, so its event says who could see it.
				OR (ev.action = 'project.deleted' AND p.id IS NULL AND (
					json_extract(ev.metadata, '$.access') = 'public'
					OR EXISTS (
						SELECT 1 FROM json_each(ev.metadata, '$.memberIds')
						WHERE json_each.value = ${userId}
					)
				))
			)
			ORDER BY ev.createdAt DESC, ev.id DESC
			LIMIT ${PAGE_SIZE + 1}
		`) as FeedRow[];

		const page = rows.slice(0, PAGE_SIZE);
		const last = page.at(-1);
		return {
			events: page.map((row) => toFeedEvent(row, canSeeInviteEmails)),
			next:
				rows.length > PAGE_SIZE && last
					? { createdAt: last.createdAt, id: last.id }
					: null,
		};
	});
