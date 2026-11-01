// Last-resort recovery for whoever runs the server, for when the only instance
// admin is locked out: bun run admin:reset-link <email>
import { DB, type tables } from "@smelp/db";
import { createPasswordResetLink } from "../src/lib/password-reset";

const email = process.argv[2]?.trim().toLowerCase();

if (!email) {
	console.error("usage: bun run admin:reset-link <email>");
	process.exit(1);
}

const sql = new DB().sqlite;
const user = (await sql`SELECT id FROM auth_user WHERE email = ${email}`)[0] as
	| Pick<tables["auth_user"], "id">
	| undefined;

if (!user) {
	console.error(`No account found for ${email}`);
	process.exit(1);
}

const { token } = await createPasswordResetLink(user.id, null);

console.log("Add this to your smelp address. It works once, for 24 hours:");
console.log(`/reset-password/${token}`);
process.exit(0);
