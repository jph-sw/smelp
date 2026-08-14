import { ORPCError } from "@orpc/server";
import { getCookie } from "@orpc/server/helpers";
import { Auth } from "@smelp/auth";
import { DB, type tables } from "@smelp/db";
import { base } from "../../orpc";

const auth = new Auth();
const sql = new DB().sqlite;

export const me = base.handler(async ({ context }) => {
	const token = getCookie(context.headers, "auth_session");
	if (token == null) {
		throw new ORPCError("UNAUTHORIZED", { message: "Not signed in" });
	}

	const session = await auth.validateAuthSessionToken(token);
	if (session == null) {
		throw new ORPCError("UNAUTHORIZED", { message: "Not signed in" });
	}

	const users =
		(await sql`SELECT * FROM auth_user WHERE id = ${session.userId}`) as tables["auth_user"][];
	const user = users[0];
	if (user == null) {
		throw new ORPCError("UNAUTHORIZED", { message: "Not signed in" });
	}

	return { user };
});
