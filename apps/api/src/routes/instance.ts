import { ORPCError } from "@orpc/server";
import { DB, type tables } from "@smelp/db";
import * as v from "valibot";
import { requireInstanceAdmin } from "../lib/access";
import { useSecureCookies } from "../lib/cookies";
import { markEmailVerified } from "../lib/email-verification";
import {
	getSignupMode,
	isFirstRun,
	SIGNUP_MODES,
	setSignupMode,
} from "../lib/instance";
import {
	isMailEnabled,
	sendMailOrThrow,
	sendPasswordResetEmail,
} from "../lib/mail";
import { createPasswordResetLink } from "../lib/password-reset";
import { version } from "../lib/version";
import { base } from "../orpc";

const sql = new DB().sqlite;

// Public: the sign-in and sign-up pages need this before anyone is signed in.
export const findInstanceStatus = base.handler(async () => ({
	needsSetup: await isFirstRun(),
	signup: await getSignupMode(),
	emailEnabled: isMailEnabled(),
	secureCookies: useSecureCookies(),
}));

// Admins only: a version number tells an attacker which known bugs to try.
export const findInstanceVersion = base.handler(async ({ context }) => {
	await requireInstanceAdmin(context.headers);
	return { version };
});

export const updateInstance = base
	.input(v.object({ signup: v.picklist(SIGNUP_MODES) }))
	.handler(async ({ input, context }) => {
		await requireInstanceAdmin(context.headers);
		await setSignupMode(input.signup);
		return { signup: input.signup };
	});

// Instance admins stay admins: there's no way back to admin from here.
export const setUserRole = base
	.input(v.object({ userId: v.string(), role: v.picklist(["guest", "user"]) }))
	.handler(async ({ input, context }) => {
		await requireInstanceAdmin(context.headers);

		const user = (
			await sql`SELECT role FROM auth_user WHERE id = ${input.userId}`
		)[0] as Pick<tables["auth_user"], "role"> | undefined;
		if (!user) throw new ORPCError("NOT_FOUND");
		if (user.role === "admin") {
			throw new ORPCError("BAD_REQUEST", {
				message: "An instance admin's role can't be changed.",
			});
		}

		await sql`
			UPDATE auth_user SET role = ${input.role}, updatedAt = ${Date.now()}
			WHERE id = ${input.userId}
		`;
		return { role: input.role };
	});

export const findInstanceUsers = base.handler(async ({ context }) => {
	await requireInstanceAdmin(context.headers);

	return (await sql`
		SELECT id, fullName, displayName, email, role, image, emailVerified, createdAt
		FROM auth_user
		ORDER BY createdAt ASC
	`) as Pick<
		tables["auth_user"],
		| "id"
		| "fullName"
		| "displayName"
		| "email"
		| "role"
		| "image"
		| "emailVerified"
		| "createdAt"
	>[];
});

// For when someone can't get the email, or the admin knows the address is theirs.
export const markEmailVerifiedByAdmin = base
	.input(v.object({ userId: v.string() }))
	.handler(async ({ input, context }) => {
		await requireInstanceAdmin(context.headers);
		if (!(await markEmailVerified(input.userId))) {
			throw new ORPCError("NOT_FOUND");
		}
		return { success: true };
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
