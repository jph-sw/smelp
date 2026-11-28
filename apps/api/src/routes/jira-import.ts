import { ORPCError } from "@orpc/server";
import { DB, type tables } from "@smelp/db";
import { eventBus } from "@smelp/events";
import { SQL } from "bun";
import * as v from "valibot";
import { requireWorkspacePermission } from "../lib/access";
import { JiraCsvError, LIMITS, parseJiraCsv } from "../lib/jira-csv";
import {
	buildPlan,
	type Mapping,
	type Plan,
	STATE_TARGETS,
} from "../lib/jira-plan";
import { watch } from "../lib/watchers";
import { base } from "../orpc";

const sql = new DB().sqlite;

// Importing is a bulk change to the whole workspace, so it needs the same right as
// managing the workspace itself: admins only.
const IMPORT_PERMISSION = "space:update";

const MappingInput = v.object({
	projects: v.optional(
		v.record(
			v.pipe(v.string(), v.maxLength(100)),
			v.object({
				include: v.optional(v.boolean()),
				id: v.optional(v.pipe(v.string(), v.maxLength(20))),
				name: v.optional(v.pipe(v.string(), v.maxLength(200))),
				access: v.optional(v.picklist(["public", "private"])),
			}),
		),
	),
	statuses: v.optional(
		v.record(v.pipe(v.string(), v.maxLength(300)), v.picklist(STATE_TARGETS)),
	),
	users: v.optional(
		v.record(
			v.pipe(v.string(), v.maxLength(300)),
			v.nullable(v.pipe(v.string(), v.maxLength(100))),
		),
	),
	// Dates stay loose here, so a bad one comes back as a dry-run error.
	sprints: v.optional(
		v.record(
			v.pipe(v.string(), v.maxLength(64)),
			v.object({
				startDate: v.pipe(v.string(), v.maxLength(10)),
				endDate: v.pipe(v.string(), v.maxLength(10)),
			}),
		),
	),
	jiraBaseUrl: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(500))),
});

const Csv = v.pipe(v.string(), v.maxLength(LIMITS.fileChars));

type Reader = (
	strings: TemplateStringsArray,
	...values: unknown[]
) => PromiseLike<unknown>;

// Reads what the plan needs to know about the workspace. Run inside the import's
// transaction, so what was checked is what is written.
async function loadContext(
	read: Reader,
	workspace: tables["workspace"],
	importerId: string,
) {
	const taken = (await read`SELECT id FROM auth_space`) as { id: string }[];
	const imported = (await read`
		SELECT sourceKey FROM import_record
		WHERE workspaceId = ${workspace.id} AND source = 'jira'
	`) as { sourceKey: string }[];
	const members = (await read`
		SELECT auth_user.id, auth_user.displayName, auth_user.fullName, auth_user.email
		FROM auth_space_member
		JOIN auth_user ON auth_user.id = auth_space_member.userId
		WHERE auth_space_member.spaceId = ${workspace.spaceId}
			AND auth_space_member.role IN ('member', 'admin')
		ORDER BY auth_user.displayName
	`) as {
		id: string;
		displayName: string;
		fullName: string;
		email: string;
	}[];
	return {
		importerId,
		workspaceId: workspace.id,
		takenIds: new Set(taken.map((row) => row.id)),
		importedKeys: new Set(imported.map((row) => row.sourceKey)),
		candidates: members,
		now: Date.now(),
	};
}

function parse(csv: string) {
	try {
		return parseJiraCsv(csv);
	} catch (error) {
		if (error instanceof JiraCsvError) {
			throw new ORPCError("BAD_REQUEST", { message: error.message });
		}
		throw error;
	}
}

// SQLite allows 32766 variables per statement; chunks stay well under it.
function* chunks<T>(rows: T[], size: number) {
	for (let i = 0; i < rows.length; i += size) yield rows.slice(i, i + size);
}

const PreviewInput = v.object({
	workspaceId: v.string(),
	csv: Csv,
	mapping: v.optional(MappingInput),
});

// The dry run: parses the file and says exactly what an import with this mapping
// would create. Nothing is saved. Send the mapping again after changing it to see
// the result of the change.
export const previewJiraImport = base
	.input(PreviewInput)
	.handler(async ({ input, context }) => {
		const { caller, workspace } = await requireWorkspacePermission(
			context.headers,
			input.workspaceId,
			IMPORT_PERMISSION,
		);

		const parsed = parse(input.csv);
		const ctx = await loadContext(sql, workspace, caller.userId);
		return buildPlan(parsed, (input.mapping ?? {}) as Mapping, ctx).dryRun;
	});

// Creates everything, or nothing: the checks run again against the live database
// inside the same transaction as the writes, so a project id taken in the meantime,
// or a member who just left, fails the whole import with nothing left behind.
export const applyJiraImport = base
	.input(v.object({ ...PreviewInput.entries, mapping: MappingInput }))
	.handler(async ({ input, context }) => {
		const { caller, workspace } = await requireWorkspacePermission(
			context.headers,
			input.workspaceId,
			IMPORT_PERMISSION,
		);

		const parsed = parse(input.csv);

		let plan: Plan;
		try {
			plan = await sql.begin(async (tx) => {
				const ctx = await loadContext(tx, workspace, caller.userId);
				const plan = buildPlan(parsed, input.mapping as Mapping, ctx);
				if (plan.dryRun.errors.length > 0) {
					throw new ORPCError("BAD_REQUEST", {
						message: plan.dryRun.errors.slice(0, 3).join(" "),
					});
				}

				for (const write of plan.projects) {
					await tx`INSERT INTO auth_space ${tx(write.space)}`;
					for (const rows of chunks(write.members, 1000)) {
						await tx`INSERT INTO auth_space_member ${tx(rows)}`;
					}
					await tx`INSERT INTO project ${tx(write.project)}`;
					await tx`INSERT INTO project_counter ${tx(write.counter)}`;
					await tx`INSERT INTO state ${tx(write.states)}`;
					for (const rows of chunks(write.cycles, 400)) {
						await tx`INSERT INTO cycle ${tx(rows)}`;
					}
					await tx`INSERT INTO import_record ${tx(write.record)}`;
					for (const rows of chunks(write.issues, 200)) {
						await tx`INSERT INTO issue ${tx(rows)}`;
					}
					for (const rows of chunks(write.comments, 400)) {
						await tx`INSERT INTO comment ${tx(rows)}`;
					}
					for (const rows of chunks(write.webLinks, 400)) {
						await tx`INSERT INTO issue_link ${tx(rows)}`;
					}
					for (const rows of chunks(write.labels, 400)) {
						await tx`INSERT INTO label ${tx(rows)}`;
					}
					for (const rows of chunks(write.issueLabels, 1000)) {
						await tx`INSERT INTO issue_label ${tx(rows)}`;
					}
					const commenters = new Map<string, (string | null)[]>();
					for (const comment of write.comments) {
						const authors = commenters.get(comment.issueId) ?? [];
						authors.push(comment.authorId);
						commenters.set(comment.issueId, authors);
					}
					for (const issue of write.issues) {
						await watch(
							issue.id,
							[
								issue.createdBy,
								issue.assignee,
								...(commenters.get(issue.id) ?? []),
							],
							tx,
						);
					}
				}
				for (const rows of chunks(plan.relations, 500)) {
					await tx`INSERT INTO issue_relation ${tx(rows)}`;
				}
				return plan;
			});
		} catch (e) {
			// Someone else got there first (the same id, or the same Jira project).
			if (
				e instanceof SQL.SQLiteError &&
				(e.code === "SQLITE_CONSTRAINT_PRIMARYKEY" ||
					e.code === "SQLITE_CONSTRAINT_UNIQUE")
			) {
				throw new ORPCError("CONFLICT", {
					message:
						"Something in this import already exists: a project id, or an earlier import of one of these Jira projects. Check the preview again.",
				});
			}
			throw e;
		}

		// One entry per project, however many work items came with it, so an import
		// doesn't bury the feed. Member and item events are not logged on purpose:
		// nobody is notified about thousands of imported items either.
		for (const write of plan.projects) {
			eventBus.emit({
				type: "project.created",
				workspaceId: workspace.id,
				entityId: write.project.id,
				actorId: caller.userId,
				payload: {
					projectId: write.project.id,
					name: write.project.name,
					source: "jira",
					itemCount: write.issues.length,
				},
			});
		}

		return {
			projects: plan.dryRun.projects
				.filter((project) => project.include)
				.map((project) => ({
					id: project.id,
					name: project.name,
					workItems: project.workItems,
				})),
			totals: plan.dryRun.totals,
			warnings: plan.dryRun.warnings,
		};
	});
