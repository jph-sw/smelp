import { Auth } from "@smelp/auth";
import { DB, type tables, Utils } from "@smelp/db";
import type { DomainEvent, DomainEventType } from "@smelp/events";
import { eventBus } from "@smelp/events";
import { isMailEnabled, sendNotificationEmail } from "./mail";
import { mentionedUserIds, plainMentions } from "./mentions";
import { RateLimiter } from "./rate-limit";
import { watcherIds } from "./watchers";

const sql = new DB().sqlite;
const auth = new Auth();
const utils = new Utils();

type NotificationType = tables["notification"]["type"];

// What one event means for the inbox: who is told, and why. When a person is in
// several drafts of one event, the first one wins.
type Draft = {
	type: NotificationType;
	userIds: string[];
	issueId: string;
	projectId: string;
	commentId: string | null;
	title: string;
};

type Rule<T extends DomainEventType> = (
	event: Extract<DomainEvent, { type: T }>,
) => Promise<Draft[]>;

// To notify people about another kind of event, add a rule here that says who
// should hear about it. Everything else (never telling people about their own
// actions, checking they can still read the item, saving, email) is shared.
const RULES: { [T in DomainEventType]?: Rule<T> } = {
	"issue.assigned": async (event) => {
		const { newValue } = event.payload;
		if (!newValue) return [];
		return [
			{
				type: "assigned",
				userIds: [newValue],
				issueId: event.entityId,
				projectId: event.payload.projectId,
				commentId: null,
				title: event.payload.title,
			},
		];
	},

	"comment.created": async (event) => {
		const { issueId } = event.payload;
		const comment = (
			await sql`SELECT * FROM comment WHERE id = ${event.entityId}`
		)[0] as tables["comment"] | undefined;
		const issue = (await sql`SELECT * FROM issue WHERE id = ${issueId}`)[0] as
			| tables["issue"]
			| undefined;
		if (!comment || !issue) return [];

		const draft = {
			issueId,
			projectId: issue.projectId,
			commentId: comment.id,
			title: issue.title,
		};
		return [
			{ ...draft, type: "mention", userIds: mentionedUserIds(comment.body) },
			{ ...draft, type: "comment", userIds: await watcherIds(issueId) },
		];
	},

	"issue.status_changed": async (event) => [
		{
			type: "status_changed",
			userIds: await watcherIds(event.entityId),
			issueId: event.entityId,
			projectId: event.payload.projectId,
			commentId: null,
			title: event.payload.title,
		},
	],
};

// Needs a place in the workspace as well as in the project, so an instance admin
// who isn't in a workspace isn't told about what happens there.
async function canRead(userId: string, projectId: string) {
	const project = (
		await sql`SELECT spaceId, workspaceId FROM project WHERE id = ${projectId}`
	)[0] as Pick<tables["project"], "spaceId" | "workspaceId"> | undefined;
	if (!project) return false;
	const workspace = (
		await sql`SELECT spaceId FROM workspace WHERE id = ${project.workspaceId}`
	)[0] as Pick<tables["workspace"], "spaceId"> | undefined;
	if (!workspace) return false;
	const inWorkspace = (
		await sql`SELECT 1 AS found FROM auth_space_member WHERE spaceId = ${workspace.spaceId} AND userId = ${userId}`
	)[0];
	if (!inWorkspace) return false;
	return auth.userHasPermission(userId, project.spaceId, "space:read");
}

function describe(type: NotificationType, actorName: string, title: string) {
	switch (type) {
		case "assigned":
			return `${actorName} assigned you "${title}"`;
		case "mention":
			return `${actorName} mentioned you on "${title}"`;
		case "comment":
			return `${actorName} commented on "${title}"`;
		case "status_changed":
			return `${actorName} changed the state of "${title}"`;
	}
}

// Tests wait on this instead of guessing how long the work takes.
const inFlight = new Set<Promise<unknown>>();
function track<T>(work: Promise<T>) {
	inFlight.add(work);
	const done = () => inFlight.delete(work);
	work.then(done, done);
	return work;
}
export async function notificationsIdle() {
	while (inFlight.size > 0) await Promise.allSettled([...inFlight]);
}

async function notify(event: DomainEvent) {
	const rule = RULES[event.type] as
		| ((event: DomainEvent) => Promise<Draft[]>)
		| undefined;
	if (!rule) return;

	const drafts = await rule(event);
	const told = new Set<string>();
	const actor = (
		await sql`SELECT displayName FROM auth_user WHERE id = ${event.actorId}`
	)[0] as Pick<tables["auth_user"], "displayName"> | undefined;
	const actorName = actor?.displayName ?? "Someone";

	for (const draft of drafts) {
		for (const userId of draft.userIds) {
			// Nobody hears about their own action, and nobody twice for one event.
			if (userId === event.actorId || told.has(userId)) continue;
			told.add(userId);
			if (!(await canRead(userId, draft.projectId))) continue;

			// One row per person per item. A newer event refreshes it and makes it
			// unread again, and an unread row keeps the stronger of the two reasons.
			await sql`
				INSERT INTO notification (
					id, userId, workspaceId, type, actorId, issueId, projectId,
					commentId, title, createdAt, readAt
				) VALUES (
					${crypto.randomUUID()}, ${userId}, ${event.workspaceId}, ${draft.type},
					${event.actorId}, ${draft.issueId}, ${draft.projectId},
					${draft.commentId}, ${draft.title}, ${Date.now()}, NULL
				)
				ON CONFLICT (userId, issueId) DO UPDATE SET
					type = CASE
						WHEN notification.readAt IS NULL AND (
							CASE notification.type WHEN 'mention' THEN 3 WHEN 'assigned' THEN 2 WHEN 'comment' THEN 1 WHEN 'status_changed' THEN 1 END
						) > (
							CASE excluded.type WHEN 'mention' THEN 3 WHEN 'assigned' THEN 2 WHEN 'comment' THEN 1 WHEN 'status_changed' THEN 1 END
						) THEN notification.type
						ELSE excluded.type
					END,
					actorId = excluded.actorId,
					commentId = COALESCE(excluded.commentId, notification.commentId),
					title = excluded.title,
					createdAt = excluded.createdAt,
					readAt = NULL
			`;
			track(emailAbout(userId, draft, event, actorName));
		}
	}
}

// At most this many emails per person per hour. Extras are dropped quietly: the
// inbox still has them.
const emailsPerUser = new RateLimiter(20, 60 * 60 * 1000);

// One at a time, so a burst of events doesn't open a pile of SMTP connections.
let sending: Promise<unknown> = Promise.resolve();

// A slow or broken mail server never holds up or fails the request that caused
// the notification, and nothing here throws.
async function emailAbout(
	userId: string,
	draft: Draft,
	event: DomainEvent,
	actorName: string,
) {
	try {
		const user = (
			await sql`SELECT email, notifyByEmail FROM auth_user WHERE id = ${userId}`
		)[0] as Pick<tables["auth_user"], "email" | "notifyByEmail"> | undefined;
		if (user?.notifyByEmail !== 1 || !isMailEnabled()) return;
		if (!emailsPerUser.consume(userId).allowed) return;

		let excerpt: string | undefined;
		if (draft.commentId) {
			const comment = (
				await sql`SELECT body FROM comment WHERE id = ${draft.commentId}`
			)[0] as Pick<tables["comment"], "body"> | undefined;
			if (comment) {
				excerpt = (await readableBody(comment.body, draft.projectId)).slice(
					0,
					500,
				);
			}
		}
		const summary = describe(draft.type, actorName, draft.title);
		const send = sending.then(() =>
			sendNotificationEmail({
				to: user.email,
				workspaceId: event.workspaceId,
				issueId: draft.issueId,
				summary,
				actorName,
				excerpt,
			}),
		);
		sending = send.catch(() => {});
		await send;
	} catch (error) {
		utils.logger.error(
			`Couldn't email a notification: ${error instanceof Error ? error.message : error}`,
		);
	}
}

// Mentions read as the current name of the member they point at, never as the
// name typed into them.
async function readableBody(body: string, projectId: string) {
	const names = new Map<string, string>();
	for (const id of mentionedUserIds(body)) {
		const member = (
			await sql`
				SELECT u.displayName FROM auth_user u
				JOIN project p ON p.id = ${projectId}
				JOIN auth_space_member m ON m.spaceId = p.spaceId AND m.userId = u.id
				WHERE u.id = ${id}
			`
		)[0] as Pick<tables["auth_user"], "displayName"> | undefined;
		if (member) names.set(id, member.displayName);
	}
	return plainMentions(body, names);
}

eventBus.onAny((event) =>
	track(
		notify(event).catch((error) => {
			utils.logger.error(
				`Couldn't create notifications: ${error instanceof Error ? error.message : error}`,
			);
		}),
	),
);
