import { ORPCError } from "@orpc/server";
import { DB, type tables } from "@smelp/db";
import * as v from "valibot";
import { requireInstanceAdmin } from "../lib/access";
import { isFirstRun, isSignupOpen, setSignupOpen } from "../lib/instance";
import { createPasswordResetLink } from "../lib/password-reset";
import { base } from "../orpc";

const sql = new DB().sqlite;

// Public: the sign-in and sign-up pages need this before anyone is signed in.
export const findInstanceStatus = base.handler(async () => ({
	needsSetup: await isFirstRun(),
	signupOpen: await isSignupOpen(),
}));

export const updateInstance = base
	.input(v.object({ signupOpen: v.boolean() }))
	.handler(async ({ input, context }) => {
		await requireInstanceAdmin(context.headers);
		await setSignupOpen(input.signupOpen);
		return { signupOpen: input.signupOpen };
	});

export const findInstanceUsers = base.handler(async ({ context }) => {
	await requireInstanceAdmin(context.headers);

	return (await sql`
		SELECT id, fullName, displayName, email, role, image, createdAt
		FROM auth_user
		ORDER BY createdAt ASC
	`) as Pick<
		tables["auth_user"],
		"id" | "fullName" | "displayName" | "email" | "role" | "image" | "createdAt"
	>[];
});

export const createPasswordReset = base
	.input(v.object({ userId: v.string() }))
	.handler(async ({ input, context }) => {
		const session = await requireInstanceAdmin(context.headers);

		const user = (
			await sql`SELECT id FROM auth_user WHERE id = ${input.userId}`
		)[0];
		if (!user) throw new ORPCError("NOT_FOUND");

		return createPasswordResetLink(input.userId, session.userId);
	});
