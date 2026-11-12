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
	v.maxLength(2_000),
	v.check((value) => {
		try {
			const { protocol } = new URL(value);
			return protocol === "http:" || protocol === "https:";
		} catch {
			return false;
		}
	}, "Enter a valid http or https link"),
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

function emit(
	type: "issue.link_added" | "issue.link_updated" | "issue.link_removed",
	issue: tables["issue"],
	actorId: string,
) {
	eventBus.emit({
		type,
		entityId: issue.id,
		workspaceId: issue.workspaceId,
		actorId,
		payload: { projectId: issue.projectId, title: issue.title },
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
		emit("issue.link_added", issue, session.userId);

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
			title: input.title ?? null,
		};
		if (updated.url === link.url && updated.title === link.title) {
			return link;
		}
		await sql`
			UPDATE issue_link
			SET url = ${updated.url}, title = ${updated.title}
			WHERE id = ${link.id}
		`;
		emit("issue.link_updated", issue, session.userId);

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
		emit("issue.link_removed", issue, session.userId);

		return { id: link.id };
	});
