import { ORPCError } from "@orpc/server";
import { DB, type tables } from "@smelp/db";
import { requireUser, resolveViewer } from "../../lib/access";
import { isMailEnabled } from "../../lib/mail";
import { base } from "../../orpc";

const sql = new DB().sqlite;

const notSignedIn = () =>
	new ORPCError("UNAUTHORIZED", { message: "Not signed in" });

async function signedInUser(userId: string) {
	const user = (
		(await sql`SELECT * FROM auth_user WHERE id = ${userId}`) as tables["auth_user"][]
	)[0];
	if (user == null) return null;

	// Without email there's no way to confirm, so nobody is held back for it.
	return {
		...user,
		emailVerificationPending: user.emailVerified !== 1 && isMailEnabled(),
	};
}

export const me = base.handler(async ({ context }) => {
	const caller = await requireUser(context.headers).catch((error) => {
		throw error instanceof ORPCError && error.code === "UNAUTHORIZED"
			? notSignedIn()
			: error;
	});

	const user = await signedInUser(caller.userId);
	if (user == null) throw notSignedIn();
	return { user };
});

// What the web app asks on every page. A visitor reading a public workspace has
// no session, which is an answer here rather than a refusal.
export const session = base.handler(async ({ context }) => {
	const viewer = await resolveViewer(context.headers);
	if (viewer.kind === "anonymous") return { user: null };
	return { user: await signedInUser(viewer.userId) };
});
