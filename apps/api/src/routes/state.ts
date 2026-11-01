import { ORPCError } from "@orpc/server";
import { DB, type tables, Utils } from "@smelp/db";
import * as v from "valibot";
import { requireProjectPermission, requireSession } from "../lib/access";
import { base } from "../orpc";

const sql = new DB().sqlite;
const utils = new Utils();

const Name = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(32));
const Color = v.pipe(v.string(), v.regex(/^#[0-9a-fA-F]{6}$/));
const Group = v.picklist([
	"backlog",
	"unstarted",
	"started",
	"completed",
	"cancelled",
]);

async function requireManageableState(headers: Headers, stateId: string) {
	await requireSession(headers);

	const state = (await sql`SELECT * FROM state WHERE id = ${stateId}`)[0] as
		| tables["state"]
		| undefined;
	if (!state) throw new ORPCError("NOT_FOUND");

	await requireProjectPermission(headers, state.projectId, "space:update");

	return state;
}

export const createState = base
	.input(
		v.object({
			projectId: v.string(),
			name: Name,
			color: Color,
			group: Group,
		}),
	)
	.handler(async ({ input, context }) => {
		await requireProjectPermission(
			context.headers,
			input.projectId,
			"space:update",
		);

		const { next } = (
			await sql`SELECT COALESCE(MAX(position), -1) + 1 AS next FROM state WHERE projectId = ${input.projectId}`
		)[0] as { next: number };

		const state: tables["state"] = {
			id: crypto.randomUUID(),
			value: utils.toSlug(input.name),
			name: input.name,
			color: input.color,
			group: input.group,
			projectId: input.projectId,
			isDefault: false,
			position: next,
		};
		await sql`INSERT INTO state ${sql(state)}`;

		return state;
	});

export const updateState = base
	.input(
		v.object({
			id: v.string(),
			name: v.optional(Name),
			color: v.optional(Color),
			group: v.optional(Group),
			// A project always has one default, so it can only be moved, not cleared.
			isDefault: v.optional(v.literal(true)),
		}),
	)
	.handler(async ({ input, context }) => {
		const state = await requireManageableState(context.headers, input.id);
		const name = input.name ?? state.name;

		await sql.begin(async (tx) => {
			await tx`
				UPDATE state SET
					name = ${name},
					value = ${utils.toSlug(name)},
					color = ${input.color ?? state.color},
					"group" = ${input.group ?? state.group}
				WHERE id = ${state.id}
			`;
			if (input.isDefault) {
				await tx`UPDATE state SET isDefault = CASE WHEN id = ${state.id} THEN 1 ELSE 0 END WHERE projectId = ${state.projectId}`;
			}
		});

		return (
			await sql`SELECT * FROM state WHERE id = ${state.id}`
		)[0] as tables["state"];
	});

export const deleteState = base
	.input(v.object({ id: v.string(), moveToStateId: v.string() }))
	.handler(async ({ input, context }) => {
		const state = await requireManageableState(context.headers, input.id);

		if (state.isDefault) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Choose another default state before deleting this one",
			});
		}

		const target = (
			await sql`SELECT id FROM state WHERE id = ${input.moveToStateId} AND projectId = ${state.projectId}`
		)[0];
		if (!target || input.moveToStateId === state.id) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Choose another state in this project for its work items",
			});
		}

		await sql.begin(async (tx) => {
			await tx`UPDATE issue SET state = ${input.moveToStateId} WHERE state = ${state.id}`;
			await tx`DELETE FROM state WHERE id = ${state.id}`;
		});

		return { id: state.id };
	});

export const reorderStates = base
	.input(v.object({ projectId: v.string(), stateIds: v.array(v.string()) }))
	.handler(async ({ input, context }) => {
		await requireProjectPermission(
			context.headers,
			input.projectId,
			"space:update",
		);

		const existing = (await sql`
			SELECT id FROM state WHERE projectId = ${input.projectId}
		`) as { id: string }[];
		const sameStates =
			existing.length === input.stateIds.length &&
			new Set(input.stateIds).size === existing.length &&
			existing.every((state) => input.stateIds.includes(state.id));
		if (!sameStates) {
			throw new ORPCError("BAD_REQUEST", {
				message: "The order must list every state in the project once",
			});
		}

		await sql.begin(async (tx) => {
			for (const [position, id] of input.stateIds.entries()) {
				await tx`UPDATE state SET position = ${position} WHERE id = ${id}`;
			}
		});

		return { success: true };
	});
