import { DB, Utils } from "@smelp/db";

const { sqlite: sql } = new DB();
const { logger } = new Utils();

// Reads a real table, so this also fails if the database file is the wrong one or
// was never migrated, not just if SQLite can't be reached.
const checkDatabase = async () => {
	await sql`SELECT 1 FROM schema_migrations LIMIT 1`;
};

// Open to anyone, so the reason only goes to the log.
export async function statusResponse(check = checkDatabase) {
	const headers = { "cache-control": "no-store" };
	try {
		await check();
		return new Response("OK", { headers });
	} catch (error) {
		logger.error("Health check failed: can't read the database", error);
		return new Response("Database unavailable", { status: 503, headers });
	}
}
