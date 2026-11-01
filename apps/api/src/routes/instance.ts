import { DB, type tables } from "@smelp/db";
import * as v from "valibot";
import { requireInstanceAdmin } from "../lib/access";
import { isFirstRun, isSignupOpen, setSignupOpen } from "../lib/instance";
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
