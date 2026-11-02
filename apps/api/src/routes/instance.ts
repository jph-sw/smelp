import { ORPCError } from "@orpc/server";
import { DB, type tables } from "@smelp/db";
import * as v from "valibot";
import { requireInstanceAdmin } from "../lib/access";
import { useSecureCookies } from "../lib/cookies";
import { isFirstRun, isSignupOpen, setSignupOpen } from "../lib/instance";
import {
	isMailEnabled,
	sendMailOrThrow,
	sendPasswordResetEmail,
} from "../lib/mail";
import { createPasswordResetLink } from "../lib/password-reset";
import { base } from "../orpc";

const sql = new DB().sqlite;

// Public: the sign-in and sign-up pages need this before anyone is signed in.
export const findInstanceStatus = base.handler(async () => ({
	needsSetup: await isFirstRun(),
	signupOpen: await isSignupOpen(),
	emailEnabled: isMailEnabled(),
	secureCookies: useSecureCookies(),
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
			await sql`SELECT id, email FROM auth_user WHERE id = ${input.userId}`
		)[0] as Pick<tables["auth_user"], "id" | "email"> | undefined;
		if (!user) throw new ORPCError("NOT_FOUND");

		const link = await createPasswordResetLink(user.id, session.userId);
		const emailDelivery = await sendPasswordResetEmail({
			to: user.email,
			token: link.token,
		});
		return { ...link, emailDelivery };
	});

// Lets whoever runs the server check their settings before relying on them. The
// message goes only to the instance admin, who already controls those settings.
export const sendTestEmail = base.handler(async ({ context }) => {
	const session = await requireInstanceAdmin(context.headers);
	if (!isMailEnabled()) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Email isn't set up on this server.",
		});
	}

	const admin = (
		await sql`SELECT email FROM auth_user WHERE id = ${session.userId}`
	)[0] as Pick<tables["auth_user"], "email">;
	try {
		await sendMailOrThrow({
			to: admin.email,
			subject: "smelp test email",
			text: "Email from your smelp server is working.",
		});
	} catch (error) {
		throw new ORPCError("BAD_REQUEST", {
			message: `Couldn't send: ${error instanceof Error ? error.message : "unknown error"}`,
		});
	}
	return { to: admin.email };
});
