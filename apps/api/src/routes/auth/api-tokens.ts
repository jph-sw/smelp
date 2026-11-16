import { ORPCError } from "@orpc/server";
import { DB, type tables } from "@smelp/db";
import * as v from "valibot";
import { API_TOKEN_PREFIX, requireSession } from "../../lib/access";
import { createSecretToken, hashSecretToken } from "../../lib/tokens";
import { base } from "../../orpc";

const sql = new DB().sqlite;

const MAX_TOKENS_PER_USER = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

type ApiTokenSummary = Omit<tables["api_token"], "userId" | "secretHash">;

export const findApiTokens = base.handler(async ({ context }) => {
	const session = await requireSession(context.headers);
	return (await sql`
		SELECT id, name, createdAt, lastUsedAt, expiresAt FROM api_token
		WHERE userId = ${session.userId}
		ORDER BY createdAt DESC, id
	`) as ApiTokenSummary[];
});

export const createApiToken = base
	.input(
		v.object({
			name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100)),
			expiresInDays: v.nullable(v.picklist([30, 90, 365])),
		}),
	)
	.handler(async ({ input, context }) => {
		const session = await requireSession(context.headers);

		const now = Date.now();
		const token = `${API_TOKEN_PREFIX}${createSecretToken()}`;
		const row: tables["api_token"] = {
			id: crypto.randomUUID(),
			userId: session.userId,
			name: input.name,
			secretHash: hashSecretToken(token),
			createdAt: now,
			lastUsedAt: null,
			expiresAt:
				input.expiresInDays === null
					? null
					: now + input.expiresInDays * DAY_MS,
		};

		await sql.begin(async (tx) => {
			const [{ count }] = (await tx`
				SELECT COUNT(*) AS count FROM api_token WHERE userId = ${session.userId}
			`) as [{ count: number }];
			if (count >= MAX_TOKENS_PER_USER) {
				throw new ORPCError("BAD_REQUEST", {
					message: `You can have at most ${MAX_TOKENS_PER_USER} API tokens. Revoke one to make another.`,
				});
			}
			await tx`INSERT INTO api_token ${tx(row)}`;
		});

		const summary: ApiTokenSummary = {
			id: row.id,
			name: row.name,
			createdAt: row.createdAt,
			lastUsedAt: row.lastUsedAt,
			expiresAt: row.expiresAt,
		};
		return { ...summary, token };
	});

export const revokeApiToken = base
	.input(v.object({ id: v.string() }))
	.handler(async ({ input, context }) => {
		const session = await requireSession(context.headers);
		const deleted = await sql`
			DELETE FROM api_token WHERE id = ${input.id} AND userId = ${session.userId}
			RETURNING id
		`;
		if (deleted.length === 0) throw new ORPCError("NOT_FOUND");
		return { success: true };
	});
