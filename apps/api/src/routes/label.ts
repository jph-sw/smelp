import { ORPCError } from "@orpc/server";
import { DB, type tables } from "@smelp/db";
import { eventBus, type LabelChange } from "@smelp/events";
import { SQL } from "bun";
import * as v from "valibot";
import { requireProjectPermission, requireUser } from "../lib/access";
import { base } from "../orpc";

const sql = new DB().sqlite;

const MAX_LABELS_PER_ITEM = 50;

const Name = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(32));
const Color = v.pipe(
	v.string(),
	v.regex(/^#[0-9a-fA-F]{6}$/, "Use a color like #3b82f6"),
	v.toLowerCase(),
);
// An empty id would be stored as-is and skip the checks that guard real ones.
const NonEmpty = v.pipe(v.string(), v.minLength(1));

// Asking about a project the viewer can't read looks the same as asking about one
// that doesn't exist, so private projects don't give themselves away.
async function requireReadableProject(headers: Headers, projectId: string) {
	try {
		await requireProjectPermission(headers, projectId, "space:read", {
			public: true,
		});
	} catch (error) {
		if (error instanceof ORPCError && error.code === "FORBIDDEN") {
			throw new ORPCError("NOT_FOUND");
		}
		throw error;
	}
}

// Same rule as the project's states and modules: it takes someone who can update
// the project.
async function requireManageableLabel(headers: Headers, labelId: string) {
	const found = (await sql`SELECT * FROM label WHERE id = ${labelId}`)[0] as
		| tables["label"]
		| undefined;
	if (!found) {
		await requireUser(headers);
		throw new ORPCError("NOT_FOUND");
	}
	await requireReadableProject(headers, found.projectId);
	const { caller, project } = await requireProjectPermission(
		headers,
		found.projectId,
		"space:update",
	);
	return { label: found, caller, project };
}

const eventBase = (
	caller: { userId: string },
	project: tables["project"],
	entityId: string,
) => ({
	workspaceId: project.workspaceId,
	actorId: caller.userId,
	entityId,
});

const isDuplicateName = (error: unknown) =>
	error instanceof SQL.SQLiteError && error.code === "SQLITE_CONSTRAINT_UNIQUE";

const duplicateName = () =>
	new ORPCError("CONFLICT", {
		message: "A label with this name already exists in the project",
	});

export const findLabels = base
	.input(v.object({ projectId: v.string() }))
	.handler(async ({ input, context }) => {
		await requireReadableProject(context.headers, input.projectId);
		return (await sql`
			SELECT * FROM label
			WHERE projectId = ${input.projectId}
			ORDER BY name COLLATE NOCASE, id
		`) as tables["label"][];
	});

export const createLabel = base
	.input(v.object({ projectId: NonEmpty, name: Name, color: Color }))
	.handler(async ({ input, context }) => {
		await requireUser(context.headers);
		await requireReadableProject(context.headers, input.projectId);
		const { caller, project } = await requireProjectPermission(
			context.headers,
			input.projectId,
			"space:update",
		);

		const label: tables["label"] = {
			id: crypto.randomUUID(),
			projectId: project.id,
			name: input.name,
			color: input.color,
			createdAt: Date.now(),
		};
		try {
			await sql`INSERT INTO label ${sql(label)}`;
		} catch (error) {
			if (isDuplicateName(error)) throw duplicateName();
			throw error;
		}

		eventBus.emit({
			...eventBase(caller, project, label.id),
			type: "label.created",
			payload: {
				projectId: project.id,
				projectName: project.name,
				name: label.name,
			},
		});
		return label;
	});

export const updateLabel = base
	.input(
		v.object({
			id: NonEmpty,
			name: v.optional(Name),
			color: v.optional(Color),
		}),
	)
	.handler(async ({ input, context }) => {
		const {
			label: old,
			caller,
			project,
		} = await requireManageableLabel(context.headers, input.id);

		const next = {
			...old,
			name: input.name ?? old.name,
			color: input.color ?? old.color,
		};
		const changes: LabelChange[] = [];
		if (next.name !== old.name) changes.push("name");
		if (next.color !== old.color) changes.push("color");
		if (changes.length === 0) return old;

		let written: unknown[];
		try {
			written = await sql`
				UPDATE label SET name = ${next.name}, color = ${next.color}
				WHERE id = ${old.id}
				RETURNING id
			`;
		} catch (error) {
			if (isDuplicateName(error)) throw duplicateName();
			throw error;
		}
		if (written.length === 0) throw new ORPCError("NOT_FOUND");

		eventBus.emit({
			...eventBase(caller, project, old.id),
			type: "label.updated",
			payload: {
				projectId: project.id,
				projectName: project.name,
				name: next.name,
				oldName: old.name,
				changes,
			},
		});
		return next;
	});

export const deleteLabel = base
	.input(v.object({ id: NonEmpty }))
	.handler(async ({ input, context }) => {
		const {
			label: old,
			caller,
			project,
		} = await requireManageableLabel(context.headers, input.id);

		// The label comes off its items through the cascade. Each item still logs it,
		// so its timeline says where the label went.
		const result = await sql.begin(async (tx) => {
			const items = (await tx`
				SELECT issue.id, issue.title FROM issue_label
				JOIN issue ON issue.id = issue_label.issueId
				WHERE issue_label.labelId = ${old.id}
			`) as Pick<tables["issue"], "id" | "title">[];
			const deleted =
				await tx`DELETE FROM label WHERE id = ${old.id} RETURNING id`;
			return { items, deleted: deleted.length > 0 };
		});
		if (!result.deleted) throw new ORPCError("NOT_FOUND");

		for (const item of result.items) {
			eventBus.emit({
				...eventBase(caller, project, item.id),
				type: "issue.label_removed",
				payload: {
					projectId: project.id,
					title: item.title,
					field: "label",
					oldValue: old.name,
					newValue: null,
				},
			});
		}
		eventBus.emit({
			...eventBase(caller, project, old.id),
			type: "label.deleted",
			payload: {
				projectId: project.id,
				projectName: project.name,
				name: old.name,
			},
		});
		return { id: old.id };
	});

// Replaces the item's labels with the ones given. Only what differs is written and
// logged, so sending the same set again changes nothing.
export const setIssueLabels = base
	.input(
		v.object({
			id: NonEmpty,
			labelIds: v.pipe(v.array(NonEmpty), v.maxLength(MAX_LABELS_PER_ITEM)),
		}),
	)
	.handler(async ({ input, context }) => {
		const caller = await requireUser(context.headers);
		const found = (await sql`SELECT * FROM issue WHERE id = ${input.id}`)[0] as
			| tables["issue"]
			| undefined;
		if (!found) throw new ORPCError("NOT_FOUND");
		await requireProjectPermission(
			context.headers,
			found.projectId,
			"content:write",
		);

		const wanted = new Set(input.labelIds);
		// Checked and written in one transaction, so a label deleted or an item moved
		// in between can't leave a label from somewhere else on the item.
		const change = await sql.begin(async (tx) => {
			const issue = (
				await tx`SELECT id, title, projectId FROM issue WHERE id = ${found.id}`
			)[0] as Pick<tables["issue"], "id" | "title" | "projectId"> | undefined;
			if (!issue) throw new ORPCError("NOT_FOUND");

			const labels = (await tx`
				SELECT id, name FROM label
				WHERE projectId = ${issue.projectId}
				ORDER BY name COLLATE NOCASE, id
			`) as Pick<tables["label"], "id" | "name">[];
			const nameOf = new Map(labels.map((label) => [label.id, label.name]));
			if ([...wanted].some((id) => !nameOf.has(id))) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Labels must belong to the work item's project",
				});
			}

			const current = new Set(
				(
					(await tx`
						SELECT labelId FROM issue_label WHERE issueId = ${issue.id}
					`) as Pick<tables["issue_label"], "labelId">[]
				).map((link) => link.labelId),
			);
			const added = [...wanted].filter((id) => !current.has(id));
			const removed = [...current].filter((id) => !wanted.has(id));

			if (added.length > 0) {
				const rows: tables["issue_label"][] = added.map((labelId) => ({
					issueId: issue.id,
					labelId,
				}));
				await tx`INSERT INTO issue_label ${tx(rows)}`;
			}
			if (removed.length > 0) {
				await tx`
					DELETE FROM issue_label
					WHERE issueId = ${issue.id} AND labelId IN ${tx(removed)}
				`;
			}
			if (added.length > 0 || removed.length > 0) {
				await tx`
					UPDATE issue SET updatedAt = ${Date.now()}, updatedBy = ${caller.userId}
					WHERE id = ${issue.id}
				`;
			}

			return {
				issue,
				added: added.map((id) => nameOf.get(id) as string),
				removed: removed.map((id) => nameOf.get(id) as string),
				labelIds: labels
					.filter((label) => wanted.has(label.id))
					.map((label) => label.id),
			};
		});

		const event = {
			entityId: change.issue.id,
			workspaceId: found.workspaceId,
			actorId: caller.userId,
		};
		const ref = {
			projectId: change.issue.projectId,
			title: change.issue.title,
		};
		for (const name of change.added) {
			eventBus.emit({
				...event,
				type: "issue.label_added",
				payload: { ...ref, field: "label", oldValue: null, newValue: name },
			});
		}
		for (const name of change.removed) {
			eventBus.emit({
				...event,
				type: "issue.label_removed",
				payload: { ...ref, field: "label", oldValue: name, newValue: null },
			});
		}

		return { labelIds: change.labelIds };
	});
