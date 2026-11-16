import { ORPCError } from "@orpc/server";
import { DB, type tables } from "@smelp/db";
import { requireUser } from "../../lib/access";
import { isMailEnabled } from "../../lib/mail";
import { base } from "../../orpc";

const sql = new DB().sqlite;

const notSignedIn = () =>
	new ORPCError("UNAUTHORIZED", { message: "Not signed in" });

export const me = base.handler(async ({ context }) => {
	const caller = await requireUser(context.headers).catch((error) => {
		throw error instanceof ORPCError && error.code === "UNAUTHORIZED"
			? notSignedIn()
			: error;
	});

	const users =
		(await sql`SELECT * FROM auth_user WHERE id = ${caller.userId}`) as tables["auth_user"][];
	const user = users[0];
	if (user == null) throw notSignedIn();

	// Without email there's no way to confirm, so nobody is held back for it.
	return {
		user: {
			...user,
			emailVerificationPending: user.emailVerified !== 1 && isMailEnabled(),
		},
	};
});
