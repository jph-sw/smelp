import { beforeAll, describe, expect, test } from "bun:test";
import { createRouterClient } from "@orpc/server";

// Imported dynamically so setup.ts points the database at a temp file first.
await import("./setup");
const { Auth } = await import("@smelp/auth");
const { DB, databasePath } = await import("@smelp/db");
const { router } = await import("../src/router");

const auth = new Auth();

async function createUser(name: string) {
	const { session, user } = await auth.signUp(
		`lock-${name}@example.test`,
		name,
		`lock-${name}`,
		"correct-horse-battery",
	);
	return {
		id: user.id,
		client: createRouterClient(router, {
			context: {
				headers: new Headers({
					cookie: `auth_session=${session.authSessionToken}`,
				}),
				ip: "198.18.4.1",
			},
		}),
	};
}

let owner: Awaited<ReturnType<typeof createUser>>;
let workspaceId: string;
let state: string;
const projectId = "LOCK";

beforeAll(async () => {
	owner = await createUser("owner");
	({ id: workspaceId } = await owner.client.workspace.create({
		name: "Locking",
	}));
	await owner.client.project.create({
		id: projectId,
		name: "Locking",
		description: "",
		access: "private",
		icon: "AppWindowIcon",
		workspaceId,
	});
	state = (await owner.client.states.find({ projectId }))[0]?.id ?? "";
});

const createIssue = (title: string) =>
	owner.client.issue.create({
		title,
		description: "",
		state,
		type: "task",
		workspaceId,
		projectId,
	});

const rejections = (results: PromiseSettledResult<unknown>[]) =>
	results.filter((r) => r.status === "rejected").map((r) => String(r.reason));

describe("when the database is busy", () => {
	test("a request waits for another process's write, rather than failing", async () => {
		// A separate process, like a backup or an admin command. It says when it has the lock.
		const holder = Bun.spawn(
			[
				"bun",
				"-e",
				`const {Database}=require("bun:sqlite");
				const d=new Database(${JSON.stringify(databasePath())});
				d.run("BEGIN IMMEDIATE");console.log("locked");
				await Bun.sleep(400);d.run("COMMIT");d.close();`,
			],
			{ stdout: "pipe" },
		);
		await holder.stdout.getReader().read();

		const started = Date.now();
		const issue = await createIssue("waited for a lock");
		expect(issue.title).toBe("waited for a lock");
		expect(Date.now() - started).toBeGreaterThan(100);
		await holder.exited;
	});

	test("many saves at the same moment all succeed", async () => {
		const results = await Promise.allSettled(
			Array.from({ length: 30 }, (_, i) => createIssue(`parallel ${i}`)),
		);
		expect(rejections(results)).toEqual([]);

		const issues = await owner.client.issues.find({ projectId });
		const created = issues.filter((i) => i.title.startsWith("parallel "));
		expect(created.length).toBe(30);
		// Every item got its own number.
		expect(new Set(created.map((i) => i.id)).size).toBe(30);
	});

	test("transactions from several people at once all succeed", async () => {
		const members = await Promise.all(
			Array.from({ length: 8 }, (_, i) => createUser(`parallel-${i}`)),
		);
		const joined = await Promise.allSettled(
			members.map((member) =>
				owner.client.workspaceInvites
					.create({ workspaceId, role: "member" })
					.then(({ token }) =>
						member.client.workspaceInvites.accept({ token }),
					),
			),
		);
		expect(rejections(joined)).toEqual([]);

		const list = await owner.client.workspaceMembers.find({ workspaceId });
		const removed = await Promise.allSettled(
			members.map((member) =>
				owner.client.workspaceMembers.remove({
					workspaceId,
					memberId: list.find((m) => m.userId === member.id)?.id ?? "",
				}),
			),
		);
		expect(rejections(removed)).toEqual([]);
	});

	test("a failed transaction doesn't undo someone else's save made meanwhile", async () => {
		const sql = new DB().sqlite;
		await sql`CREATE TABLE IF NOT EXISTS lock_note (value TEXT)`;

		const failing = sql
			.begin(async (tx) => {
				await tx`INSERT INTO lock_note VALUES ('rolled back')`;
				await Bun.sleep(100);
				throw new Error("changed my mind");
			})
			.catch(() => "failed");
		// Starts while that transaction is open.
		await Bun.sleep(20);
		await sql`INSERT INTO lock_note VALUES ('kept')`;

		expect(await failing).toBe("failed");
		const rows = (await sql`SELECT value FROM lock_note`) as {
			value: string;
		}[];
		expect(rows.map((row) => row.value)).toEqual(["kept"]);
	});

	test("code inside a transaction can use the normal connection without deadlocking", async () => {
		const sql = new DB().sqlite;
		await sql`CREATE TABLE IF NOT EXISTS lock_inner (value TEXT)`;

		await sql
			.begin(async (tx) => {
				await tx`INSERT INTO lock_inner VALUES ('through tx')`;
				// Some helpers use their own module's connection, not the tx they're inside.
				await sql`INSERT INTO lock_inner VALUES ('through sql')`;
				throw new Error("undo both");
			})
			.catch(() => {});

		expect((await sql`SELECT value FROM lock_inner`).length).toBe(0);
	});

	test("other requests' reads see only finished work", async () => {
		const sql = new DB().sqlite;
		await sql`CREATE TABLE IF NOT EXISTS lock_read (value TEXT)`;

		const writing = sql.begin(async (tx) => {
			await tx`INSERT INTO lock_read VALUES ('unfinished')`;
			await Bun.sleep(60);
		});
		await Bun.sleep(10);
		const seen = await sql`SELECT value FROM lock_read`;
		await writing;

		// It waited for the transaction, so it saw the finished row, not a partial state.
		expect(seen.length).toBe(1);
	});

	test("failed queries report their error and don't block the next ones", async () => {
		const sql = new DB().sqlite;
		const failedQuery = await (async () => {
			await sql`SELECT * FROM no_such_table`;
		})().catch((error) => String(error));
		expect(failedQuery).toContain("no_such_table");

		const failedTransaction = await sql
			.begin(async (tx) => {
				await tx`SELECT * FROM no_such_table`;
			})
			.catch((error) => String(error));
		expect(failedTransaction).toContain("no_such_table");

		expect((await sql`SELECT 1 AS one`)[0]).toEqual({ one: 1 });
	});

	test("a request isn't stuck behind another request's open transaction", async () => {
		const sql = new DB().sqlite;
		const open = sql.begin(async (tx) => {
			await tx`SELECT 1`;
			await Bun.sleep(150);
			await tx`SELECT 2`;
		});
		await Bun.sleep(20);
		const started = Date.now();
		await createIssue("behind a transaction");
		await open;
		expect(Date.now() - started).toBeLessThan(2000);
	});
});
