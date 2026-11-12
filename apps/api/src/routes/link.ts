import { ORPCError } from "@orpc/server";
import { DB, type tables } from "@smelp/db";
import { eventBus } from "@smelp/events";
import * as v from "valibot";
import { requireProjectPermission, requireSession } from "../lib/access";
import { base } from "../orpc";

const sql = new DB().sqlite;

// Only plain web links: anything else (javascript:, data:, file:...) is refused.
const Url = v.pipe(
	v.string(),
	v.trim(),
	v.minLength(1),
	// A cap before parsing keeps absurd input away from the URL parser.
	v.maxLength(8_000),
	v.check((value) => {
		try {
			const { protocol } = new URL(value);
			return protocol === "http:" || protocol === "https:";
		} catch {
			return false;
		}
	}, "Enter a valid http or https link"),
	// Store what the parser makes of it, so "https:x.test" or a control character
	// prefix can't turn into a relative href or show raw in the list.
	v.transform((value) => new URL(value).href),
	v.maxLength(2_000),
);

// An empty title means "none": the link shows its URL instead.
const Title = v.pipe(
	v.string(),
	v.trim(),
	v.maxLength(200),
	v.transform((value) => (value === "" ? null : value)),
);

async function findIssueOrThrow(issueId: string) {
	const issue = (await sql`SELECT * FROM issue WHERE id = ${issueId}`)[0] as
		| tables["issue"]
		| undefined;
	if (!issue) throw new ORPCError("NOT_FOUND");
	return issue;
}

async function findLinkOrThrow(id: string) {
	const link = (await sql`SELECT * FROM issue_link WHERE id = ${id}`)[0] as
		| tables["issue_link"]
		| undefined;
	if (!link) throw new ORPCError("NOT_FOUND");
	return link;
}

// The log gets the link's title, never its URL: a URL can carry a token.
function emit(
	type: "issue.link_added" | "issue.link_updated" | "issue.link_removed",
	issue: tables["issue"],
	actorId: string,
	oldValue: string | null,
	newValue: string | null,
) {
	eventBus.emit({
		type,
		entityId: issue.id,
		workspaceId: issue.workspaceId,
		actorId,
		payload: {
			projectId: issue.projectId,
			title: issue.title,
			field: "link",
			oldValue,
			newValue,
		},
	});
}

export const findLinks = base
	.input(v.object({ issueId: v.string() }))
	.handler(async ({ input, context }) => {
		await requireSession(context.headers);
		const issue = await findIssueOrThrow(input.issueId);
		await requireProjectPermission(
			context.headers,
			issue.projectId,
			"space:read",
		);

		return (await sql`
			SELECT * FROM issue_link
			WHERE issueId = ${issue.id}
			ORDER BY createdAt ASC, rowid ASC
		`) as tables["issue_link"][];
	});

export const createLink = base
	.input(v.object({ issueId: v.string(), url: Url, title: v.optional(Title) }))
	.handler(async ({ input, context }) => {
		const session = await requireSession(context.headers);
		const issue = await findIssueOrThrow(input.issueId);
		await requireProjectPermission(
			context.headers,
			issue.projectId,
			"content:write",
		);

		const link: tables["issue_link"] = {
			id: crypto.randomUUID(),
			issueId: issue.id,
			url: input.url,
			title: input.title ?? null,
			createdBy: session.userId,
			createdAt: Date.now(),
		};
		await sql`INSERT INTO issue_link ${sql(link)}`;
		emit("issue.link_added", issue, session.userId, null, link.title);

		return link;
	});

export const updateLink = base
	.input(v.object({ id: v.string(), url: Url, title: v.optional(Title) }))
	.handler(async ({ input, context }) => {
		const session = await requireSession(context.headers);
		const link = await findLinkOrThrow(input.id);
		const issue = await findIssueOrThrow(link.issueId);
		await requireProjectPermission(
			context.headers,
			issue.projectId,
			"content:write",
		);

		const updated: tables["issue_link"] = {
			...link,
			url: input.url,
			// No title keeps the current one; an empty title clears it.
			title: input.title === undefined ? link.title : input.title,
		};
		if (updated.url === link.url && updated.title === link.title) {
			return link;
		}
		await sql`
			UPDATE issue_link
			SET url = ${updated.url}, title = ${updated.title}
			WHERE id = ${link.id}
		`;
		emit(
			"issue.link_updated",
			issue,
			session.userId,
			link.title,
			updated.title,
		);

		return updated;
	});

export const deleteLink = base
	.input(v.object({ id: v.string() }))
	.handler(async ({ input, context }) => {
		const session = await requireSession(context.headers);
		const link = await findLinkOrThrow(input.id);
		const issue = await findIssueOrThrow(link.issueId);
		await requireProjectPermission(
			context.headers,
			issue.projectId,
			"content:write",
		);

		await sql`DELETE FROM issue_link WHERE id = ${link.id}`;
		emit("issue.link_removed", issue, session.userId, link.title, null);

		return { id: link.id };
	});
