import { ORPCError } from "@orpc/server";
import { DB, type tables } from "@smelp/db";
import { SQL } from "bun";
import * as v from "valibot";
import { requireSession } from "../../lib/access";
import { detectImageType, MAX_AVATAR_BYTES } from "../../lib/avatars";
import { base } from "../../orpc";

const sql = new DB().sqlite;

export const updateProfile = base
	.input(
		v.object({
			fullName: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(80)),
			displayName: v.pipe(
				v.string(),
				v.trim(),
				v.minLength(1),
				v.maxLength(40),
			),
		}),
	)
	.handler(async ({ input, context }) => {
		const session = await requireSession(context.headers);

		try {
			await sql`
				UPDATE auth_user
				SET fullName = ${input.fullName}, displayName = ${input.displayName}
				WHERE id = ${session.userId}
			`;
		} catch (error) {
			if (
				error instanceof SQL.SQLiteError &&
				error.code === "SQLITE_CONSTRAINT_UNIQUE"
			) {
				throw new ORPCError("CONFLICT", {
					message: "That display name is already taken",
				});
			}
			throw error;
		}

		return { success: true };
	});

export const setAvatar = base
	.input(
		v.object({
			// Base64 is 4 characters for every 3 bytes.
			image: v.pipe(
				v.string(),
				v.maxLength(Math.ceil(MAX_AVATAR_BYTES / 3) * 4),
			),
		}),
	)
	.handler(async ({ input, context }) => {
		const session = await requireSession(context.headers);

		const data = new Uint8Array(Buffer.from(input.image, "base64"));
		const contentType = detectImageType(data);
		if (!contentType) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Use a PNG, JPEG or WebP image.",
			});
		}

		const updatedAt = Date.now();
		const avatar: tables["auth_user_avatar"] = {
			userId: session.userId,
			contentType,
			data,
			updatedAt,
		};
		const image = `/api/avatars/${session.userId}?v=${updatedAt}`;

		await sql.begin(async (tx) => {
			await tx`DELETE FROM auth_user_avatar WHERE userId = ${session.userId}`;
			await tx`INSERT INTO auth_user_avatar ${tx(avatar)}`;
			await tx`UPDATE auth_user SET image = ${image} WHERE id = ${session.userId}`;
		});

		return { image };
	});

export const removeAvatar = base.handler(async ({ context }) => {
	const session = await requireSession(context.headers);

	await sql.begin(async (tx) => {
		await tx`DELETE FROM auth_user_avatar WHERE userId = ${session.userId}`;
		await tx`UPDATE auth_user SET image = NULL WHERE id = ${session.userId}`;
	});

	return { success: true };
});
