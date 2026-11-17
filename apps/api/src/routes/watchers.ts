import { ORPCError } from "@orpc/server";
import { DB, type tables } from "@smelp/db";
import * as v from "valibot";
import {
	requireIssueRead,
	requireProjectPermission,
	requireUser,
	type Viewer,
} from "../lib/access";
import { unwatch, watch } from "../lib/watchers";
import { base } from "../orpc";

const sql = new DB().sqlite;

// Notifications only reach people in the item's workspace, so only they can watch.
async function inWorkspace(userId: string, workspaceId: string) {
	const row = (
		await sql`
			SELECT 1 AS found FROM auth_space_member
			JOIN workspace ON workspace.spaceId = auth_space_member.spaceId
			WHERE workspace.id = ${workspaceId} AND auth_space_member.userId = ${userId}
		`
	)[0];
	return row !== undefined;
}

async function describeWatchers(
	viewer: Viewer,
	issue: tables["issue"],
	project: tables["project"],
) {
	const watchers = (await sql`
		SELECT auth_user.id, auth_user.displayName AS name, auth_user.image
		FROM issue_watcher
		JOIN auth_user ON auth_user.id = issue_watcher.userId
		WHERE issue_watcher.issueId = ${issue.id}
		ORDER BY issue_watcher.createdAt ASC, auth_user.displayName ASC
	`) as { id: string; name: string; image: string | null }[];

	const userId = viewer.kind === "user" ? viewer.userId : null;
	return {
		watching: watchers.some((watcher) => watcher.id === userId),
		canWatch:
			userId !== null &&
			project.archivedAt === null &&
			(await inWorkspace(userId, issue.workspaceId)),
		count: watchers.length,
		watchers,
	};
}

export const findWatchers = base
	.input(v.object({ issueId: v.string() }))
	.handler(async ({ input, context }) => {
		const { issue, viewer, project } = await requireIssueRead(
			context.headers,
			input.issueId,
		);
		return describeWatchers(viewer, issue, project);
	});

// The desired state rather than a toggle, so a repeated call changes nothing.
export const setWatching = base
	.input(v.object({ issueId: v.string(), watching: v.boolean() }))
	.handler(async ({ input, context }) => {
		const caller = await requireUser(context.headers);
		const { issue, viewer, project } = await requireIssueRead(
			context.headers,
			input.issueId,
		);
		// Open to read-only guests, like comments, but not on an archived project.
		await requireProjectPermission(
			context.headers,
			issue.projectId,
			"space:read",
			{ write: true },
		);
		if (!(await inWorkspace(caller.userId, issue.workspaceId))) {
			throw new ORPCError("FORBIDDEN");
		}

		if (input.watching) await watch(issue.id, [caller.userId]);
		else await unwatch(issue.id, caller.userId);

		return describeWatchers(viewer, issue, project);
	});
