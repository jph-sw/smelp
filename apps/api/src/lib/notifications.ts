import { Auth } from "@smelp/auth";
import { DB, type tables, Utils } from "@smelp/db";
import type { DomainEvent, DomainEventType } from "@smelp/events";
import { eventBus } from "@smelp/events";
import { sendNotificationEmail } from "./mail";
import { mentionedUserIds, plainMentions } from "./mentions";

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

		const earlier = (await sql`
			SELECT DISTINCT authorId FROM comment
			WHERE issueId = ${issueId} AND authorId IS NOT NULL
		`) as { authorId: string }[];

		const followers = [
			issue.createdBy,
			issue.assignee,
			...earlier.map((row) => row.authorId),
		].filter((id): id is string => id !== null);

		const draft = {
			issueId,
			projectId: issue.projectId,
			commentId: comment.id,
			title: issue.title,
		};
		return [
			{ ...draft, type: "mention", userIds: mentionedUserIds(comment.body) },
			{ ...draft, type: "comment", userIds: followers },
		];
	},
};

async function canRead(userId: string, projectId: string) {
	const project = (
		await sql`SELECT spaceId FROM project WHERE id = ${projectId}`
	)[0] as Pick<tables["project"], "spaceId"> | undefined;
	if (!project) return false;
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
	}
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

			const row: tables["notification"] = {
				id: crypto.randomUUID(),
				userId,
				workspaceId: event.workspaceId,
				type: draft.type,
				actorId: event.actorId,
				issueId: draft.issueId,
				projectId: draft.projectId,
				commentId: draft.commentId,
				title: draft.title,
				createdAt: Date.now(),
				readAt: null,
			};
			await sql`INSERT INTO notification ${sql(row)}`;
			void emailAbout(row, actorName);
		}
	}
}

// Fire and forget: a slow or broken mail server never holds up or fails the
// request that caused the notification.
async function emailAbout(row: tables["notification"], actorName: string) {
	try {
		const user = (
			await sql`SELECT email, notifyByEmail FROM auth_user WHERE id = ${row.userId}`
		)[0] as Pick<tables["auth_user"], "email" | "notifyByEmail"> | undefined;
		if (user?.notifyByEmail !== 1) return;

		let excerpt: string | undefined;
		if (row.commentId) {
			const comment = (
				await sql`SELECT body FROM comment WHERE id = ${row.commentId}`
			)[0] as Pick<tables["comment"], "body"> | undefined;
			if (comment) excerpt = plainMentions(comment.body).slice(0, 500);
		}
		const summary = describe(row.type, actorName, row.title);
		await sendNotificationEmail({
			to: user.email,
			workspaceId: row.workspaceId,
			issueId: row.issueId,
			summary,
			excerpt,
		});
	} catch (error) {
		utils.logger.error(
			`Couldn't email a notification: ${error instanceof Error ? error.message : error}`,
		);
	}
}

eventBus.onAny(async (event) => {
	try {
		await notify(event);
	} catch (error) {
		utils.logger.error(
			`Couldn't create notifications: ${error instanceof Error ? error.message : error}`,
		);
	}
});
