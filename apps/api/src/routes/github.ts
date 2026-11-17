import { randomBytes } from "node:crypto";
import { ORPCError } from "@orpc/server";
import { DB, type tables } from "@smelp/db";
import * as v from "valibot";
import { requireIssueRead, requireProjectPermission } from "../lib/access";
import { base } from "../orpc";

const sql = new DB().sqlite;

// owner/name, also taken from a pasted repository address.
const Repo = v.pipe(
	v.string(),
	v.trim(),
	v.maxLength(300),
	v.transform((value) =>
		value
			.replace(/^(https?:\/\/)?(www\.)?github\.com\//i, "")
			.replace(/(\.git)?\/*$/, ""),
	),
	v.regex(
		/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/,
		"Enter the repository as owner/name",
	),
);

type Connection = Pick<
	tables["project_github_repo"],
	"id" | "repo" | "createdAt"
>;

// The secret is left out on purpose: it is only shown when it is made.
const view = (connection: Connection) => ({
	repo: connection.repo,
	webhookPath: `/api/github/webhook/${connection.id}`,
	createdAt: connection.createdAt,
});

const newSecret = () => randomBytes(32).toString("hex");

export const findGithubRepo = base
	.input(v.object({ projectId: v.string() }))
	.handler(async ({ input, context }) => {
		await requireProjectPermission(
			context.headers,
			input.projectId,
			"space:update",
			{ allowArchived: true },
		);
		const connection = (
			await sql`
			SELECT id, repo, createdAt FROM project_github_repo
			WHERE projectId = ${input.projectId}
		`
		)[0] as Connection | undefined;
		return connection ? view(connection) : null;
	});

export const connectGithubRepo = base
	.input(v.object({ projectId: v.string(), repo: Repo }))
	.handler(async ({ input, context }) => {
		const { caller } = await requireProjectPermission(
			context.headers,
			input.projectId,
			"space:update",
		);
		const connection: tables["project_github_repo"] = {
			id: crypto.randomUUID(),
			projectId: input.projectId,
			repo: input.repo,
			secret: newSecret(),
			createdBy: caller.userId,
			createdAt: Date.now(),
		};
		const inserted = await sql`
			INSERT INTO project_github_repo ${sql(connection)}
			ON CONFLICT (projectId) DO NOTHING
			RETURNING id
		`;
		if (inserted.length === 0) {
			throw new ORPCError("CONFLICT", {
				message: "This project is already connected to a repository",
			});
		}
		return { ...view(connection), secret: connection.secret };
	});

export const regenerateGithubSecret = base
	.input(v.object({ projectId: v.string() }))
	.handler(async ({ input, context }) => {
		await requireProjectPermission(
			context.headers,
			input.projectId,
			"space:update",
		);
		const secret = newSecret();
		const connection = (
			await sql`
			UPDATE project_github_repo SET secret = ${secret}
			WHERE projectId = ${input.projectId}
			RETURNING id, repo, createdAt
		`
		)[0] as Connection | undefined;
		if (!connection) throw new ORPCError("NOT_FOUND");
		return { ...view(connection), secret };
	});

// What was already linked stays on the work items.
export const disconnectGithubRepo = base
	.input(v.object({ projectId: v.string() }))
	.handler(async ({ input, context }) => {
		await requireProjectPermission(
			context.headers,
			input.projectId,
			"space:update",
		);
		await sql`DELETE FROM project_github_repo WHERE projectId = ${input.projectId}`;
		return { projectId: input.projectId };
	});

export const findGithubRefs = base
	.input(v.object({ issueId: v.string() }))
	.handler(async ({ input, context }) => {
		const { issue } = await requireIssueRead(context.headers, input.issueId);
		return (await sql`
			SELECT * FROM issue_github_ref
			WHERE issueId = ${issue.id}
			ORDER BY
				CASE kind WHEN 'pull_request' THEN 0 WHEN 'branch' THEN 1 ELSE 2 END,
				updatedAt DESC,
				rowid DESC
		`) as tables["issue_github_ref"][];
	});
