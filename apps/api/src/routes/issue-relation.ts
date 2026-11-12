import { ORPCError } from "@orpc/server";
import { Auth } from "@smelp/auth";
import { DB, type tables } from "@smelp/db";
import { eventBus } from "@smelp/events";
import { SQL } from "bun";
import * as v from "valibot";
import {
	requireNotArchived,
	requireProjectPermission,
	requireSession,
} from "../lib/access";
import { base } from "../orpc";

const sql = new DB().sqlite;
const auth = new Auth();

// How a relation reads from one of its two items. A relation is stored once, from
// its source ("blocks", "duplicates", "relates"); the target sees the inverse.
const KINDS = [
	"blocks",
	"blocked_by",
	"relates",
	"duplicates",
	"duplicated_by",
] as const;
export type RelationKind = (typeof KINDS)[number];

const INVERSE: Record<RelationKind, RelationKind> = {
	blocks: "blocked_by",
	blocked_by: "blocks",
	relates: "relates",
	duplicates: "duplicated_by",
	duplicated_by: "duplicates",
};

function kindFrom(
	type: tables["issue_relation"]["type"],
	asSource: boolean,
): RelationKind {
	return asSource ? type : INVERSE[type];
}

async function findIssueOrThrow(issueId: string) {
	const issue = (await sql`SELECT * FROM issue WHERE id = ${issueId}`)[0] as
		| tables["issue"]
		| undefined;
	if (!issue) throw new ORPCError("NOT_FOUND");
	return issue;
}

export type IssueRelation = {
	id: string;
	kind: RelationKind;
	createdAt: number;
	issue: {
		id: string;
		title: string;
		projectId: string;
		projectName: string;
		projectArchived: boolean;
		stateName: string;
		stateColor: string;
		stateGroup: string;
	};
};

type RelationRow = tables["issue_relation"] & {
	relatedId: string;
	title: string;
	projectId: string;
	projectName: string;
	projectSpaceId: string;
	projectArchived: number;
	stateName: string;
	stateColor: string;
	stateGroup: string;
};

export const findIssueRelations = base
	.input(v.object({ issueId: v.string() }))
	.handler(async ({ input, context }): Promise<IssueRelation[]> => {
		await requireSession(context.headers);
		const issue = await findIssueOrThrow(input.issueId);
		const { session } = await requireProjectPermission(
			context.headers,
			issue.projectId,
			"space:read",
		);

		const rows = (await sql`
			SELECT
				r.*,
				CASE WHEN r.sourceId = ${issue.id} THEN r.targetId ELSE r.sourceId END AS relatedId,
				other.title,
				other.projectId,
				project.name AS projectName,
				project.spaceId AS projectSpaceId,
				project.archivedAt IS NOT NULL AS projectArchived,
				state.name AS stateName,
				state.color AS stateColor,
				state."group" AS stateGroup
			FROM issue_relation r
			JOIN issue other ON other.id =
				CASE WHEN r.sourceId = ${issue.id} THEN r.targetId ELSE r.sourceId END
			JOIN project ON project.id = other.projectId
			JOIN state ON state.id = other.state
			WHERE r.sourceId = ${issue.id} OR r.targetId = ${issue.id}
			ORDER BY r.createdAt ASC, r.id ASC
		`) as RelationRow[];

		// Items in projects the caller can't read are left out, as if not there.
		const readable = new Map<string, boolean>();
		const relations: IssueRelation[] = [];
		for (const row of rows) {
			let allowed = readable.get(row.projectId);
			if (allowed === undefined) {
				allowed = await auth.userHasPermission(
					session.userId,
					row.projectSpaceId,
					"space:read",
				);
				readable.set(row.projectId, allowed);
			}
			if (!allowed) continue;
			relations.push({
				id: row.id,
				kind: kindFrom(row.type, row.sourceId === issue.id),
				createdAt: row.createdAt,
				issue: {
					id: row.relatedId,
					title: row.title,
					projectId: row.projectId,
					projectName: row.projectName,
					projectArchived: row.projectArchived === 1,
					stateName: row.stateName,
					stateColor: row.stateColor,
					stateGroup: row.stateGroup,
				},
			});
		}
		return relations;
	});

// Relations can cross projects, but only inside one workspace. Adding or removing
// one changes both items, so neither project may be archived. The caller needs
// write access to the item they act from and read access to the other.
export const addIssueRelation = base
	.input(
		v.object({
			issueId: v.string(),
			relatedId: v.string(),
			kind: v.picklist(KINDS),
		}),
	)
	.handler(async ({ input, context }) => {
		const session = await requireSession(context.headers);
		const issue = await findIssueOrThrow(input.issueId);
		await requireProjectPermission(
			context.headers,
			issue.projectId,
			"content:write",
		);

		if (input.relatedId === issue.id) {
			throw new ORPCError("BAD_REQUEST", {
				message: "A work item can't be related to itself",
			});
		}
		const related = (
			await sql`SELECT * FROM issue WHERE id = ${input.relatedId}`
		)[0] as tables["issue"] | undefined;
		if (!related) throw new ORPCError("NOT_FOUND");
		if (related.workspaceId !== issue.workspaceId) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Work items can only be related within the same workspace",
			});
		}
		const { project: relatedProject } = await requireProjectPermission(
			context.headers,
			related.projectId,
			"space:read",
		);
		requireNotArchived(relatedProject);

		const conflict = new ORPCError("CONFLICT", {
			message: "These work items are already related",
		});
		const existing = (
			await sql`
				SELECT id FROM issue_relation
				WHERE (sourceId = ${issue.id} AND targetId = ${related.id})
					OR (sourceId = ${related.id} AND targetId = ${issue.id})
			`
		)[0];
		if (existing) throw conflict;

		const fromSource = !input.kind.endsWith("_by");
		const type = (
			fromSource ? input.kind : INVERSE[input.kind]
		) as tables["issue_relation"]["type"];
		const relation: tables["issue_relation"] = {
			id: crypto.randomUUID(),
			sourceId: fromSource ? issue.id : related.id,
			targetId: fromSource ? related.id : issue.id,
			type,
			createdAt: Date.now(),
			createdBy: session.userId,
		};
		try {
			await sql`INSERT INTO issue_relation ${sql(relation)}`;
		} catch (e) {
			if (
				e instanceof SQL.SQLiteError &&
				e.code.startsWith("SQLITE_CONSTRAINT")
			) {
				throw conflict;
			}
			throw e;
		}

		eventBus.emit({
			type: "issue.relation_added",
			entityId: issue.id,
			workspaceId: issue.workspaceId,
			actorId: session.userId,
			payload: {
				projectId: issue.projectId,
				title: issue.title,
				field: "relation",
				oldValue: null,
				newValue: input.kind,
				relatedId: related.id,
				relatedTitle: related.title,
			},
		});

		return { id: relation.id };
	});

export const removeIssueRelation = base
	.input(v.object({ issueId: v.string(), id: v.string() }))
	.handler(async ({ input, context }) => {
		const session = await requireSession(context.headers);
		const issue = await findIssueOrThrow(input.issueId);
		await requireProjectPermission(
			context.headers,
			issue.projectId,
			"content:write",
		);

		const relation = (
			await sql`
				SELECT * FROM issue_relation
				WHERE id = ${input.id} AND (sourceId = ${issue.id} OR targetId = ${issue.id})
			`
		)[0] as tables["issue_relation"] | undefined;
		if (!relation) throw new ORPCError("NOT_FOUND");

		const asSource = relation.sourceId === issue.id;
		const related = await findIssueOrThrow(
			asSource ? relation.targetId : relation.sourceId,
		);
		const relatedProject = (
			await sql`SELECT * FROM project WHERE id = ${related.projectId}`
		)[0] as tables["project"];
		requireNotArchived(relatedProject);

		await sql`DELETE FROM issue_relation WHERE id = ${relation.id}`;

		eventBus.emit({
			type: "issue.relation_removed",
			entityId: issue.id,
			workspaceId: issue.workspaceId,
			actorId: session.userId,
			payload: {
				projectId: issue.projectId,
				title: issue.title,
				field: "relation",
				oldValue: kindFrom(relation.type, asSource),
				newValue: null,
				relatedId: related.id,
				relatedTitle: related.title,
			},
		});

		return { id: relation.id };
	});
