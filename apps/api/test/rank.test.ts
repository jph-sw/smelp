import { Database } from "bun:sqlite";
import { beforeAll, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { createRouterClient } from "@orpc/server";
import { generateKeyBetween } from "fractional-indexing";

// Imported dynamically so setup.ts points the database at a temp file first.
await import("./setup");
const { Auth } = await import("@smelp/auth");
const { DB } = await import("@smelp/db");
const { router } = await import("../src/router");

const sql = new DB().sqlite;

const auth = new Auth();

const PROJECT = "RNK";
const OTHER_PROJECT = "RNO";

async function createUser(name: string) {
	const { session, user } = await auth.signUp(
		`rank-${name}@example.test`,
		name,
		`rank-${name}`,
		"correct-horse-battery",
	);
	return {
		id: user.id,
		client: createRouterClient(router, {
			context: {
				headers: new Headers({
					cookie: `auth_session=${session.authSessionToken}`,
				}),
				ip: "198.51.100.40",
			},
		}),
	};
}

let owner: Awaited<ReturnType<typeof createUser>>;
let workspaceId: string;
const states: Record<string, string[]> = {};

beforeAll(async () => {
	owner = await createUser("owner");
	({ id: workspaceId } = await owner.client.workspace.create({
		name: "Rank tests",
	}));
	for (const id of [PROJECT, OTHER_PROJECT]) {
		await owner.client.project.create({
			id,
			name: `Project ${id}`,
			description: "",
			access: "private",
			icon: "AppWindowIcon",
			workspaceId,
		});
		states[id] = (await owner.client.states.find({ projectId: id })).map(
			(state) => state.id,
		);
	}
});

const create = async (title: string, projectId = PROJECT) =>
	(
		await owner.client.issue.create({
			title,
			description: "",
			state: states[projectId]?.[0] ?? "",
			workspaceId,
			projectId,
		})
	).id;

const order = async (projectId = PROJECT) =>
	(await owner.client.issues.find({ projectId })).map((issue) => issue.title);

const expectBadRequest = (call: Promise<unknown>) =>
	expect(call).rejects.toMatchObject({ code: "BAD_REQUEST" });

describe("backlog order", () => {
	let a: string;
	let b: string;
	let c: string;

	test("new items go to the bottom, in the order they were made", async () => {
		a = await create("A");
		b = await create("B");
		c = await create("C");
		expect(await order()).toEqual(["A", "B", "C"]);
	});

	test("moving an item after another puts it between that one and the next", async () => {
		const before = await owner.client.issue.find({ issueId: c });
		const moved = await owner.client.issue.update({ id: c, after: a });
		expect(await order()).toEqual(["A", "C", "B"]);
		expect(moved.updatedAt).toBe(before.updatedAt);
		expect(moved.updatedBy).toBe(before.updatedBy);
	});

	test("editing either neighbour keeps the order", async () => {
		await owner.client.issue.update({ id: a, title: "A edited" });
		await owner.client.issue.update({
			id: b,
			state: states[PROJECT]?.[1] ?? "",
		});
		expect(await order()).toEqual(["A edited", "C", "B"]);
	});

	test("before the first item puts it on top", async () => {
		await owner.client.issue.update({ id: b, before: a });
		expect(await order()).toEqual(["B", "A edited", "C"]);
	});

	test("a move together with another change does both", async () => {
		await owner.client.issue.update({
			id: b,
			after: c,
			state: states[PROJECT]?.[2] ?? "",
		});
		expect(await order()).toEqual(["A edited", "C", "B"]);
		const moved = await owner.client.issue.find({ issueId: b });
		expect(moved.state).toBe(states[PROJECT]?.[2] ?? "");
	});

	test("an item moves only next to another item of its project", async () => {
		const elsewhere = await create("Elsewhere", OTHER_PROJECT);
		await expectBadRequest(owner.client.issue.update({ id: a, after: a }));
		await expectBadRequest(
			owner.client.issue.update({ id: a, after: elsewhere }),
		);
		await expectBadRequest(
			owner.client.issue.update({ id: a, before: b, after: c }),
		);
		await expectBadRequest(
			owner.client.issue.update({
				id: a,
				after: elsewhere,
				title: "Not saved",
			}),
		);
		expect(await order()).toEqual(["A edited", "C", "B"]);
	});
});

describe("items that share a rank", () => {
	test("an item still moves between them", async () => {
		const x = await create("X", OTHER_PROJECT);
		const y = await create("Y", OTHER_PROJECT);
		const z = await create("Z", OTHER_PROJECT);
		await sql`UPDATE issue SET rank = 'a0' WHERE id IN (${x}, ${y})`;
		const titles = async () =>
			(await order(OTHER_PROJECT)).filter((title) => title.length === 1);
		expect(await titles()).toEqual(["X", "Y", "Z"]);

		await owner.client.issue.update({ id: z, after: x });
		expect(await titles()).toEqual(["X", "Z", "Y"]);
	});
});

describe("issue_rank migration", () => {
	const migration = readdirSync("migrations").find((name) =>
		name.endsWith("_issue_rank.sql"),
	);

	test("ranks existing items in the order the board showed them", () => {
		const db = new Database(":memory:");
		db.run(
			"CREATE TABLE issue (id TEXT PRIMARY KEY, projectId TEXT NOT NULL, updatedAt INTEGER NOT NULL)",
		);
		const insert = db.prepare("INSERT INTO issue VALUES (?, ?, ?)");
		for (let n = 0; n < 70; n++) insert.run(`P-${n}`, "P", n);
		insert.run("Q-1", "Q", 5);
		db.run(readFileSync(`migrations/${migration}`, "utf8"));

		const ranked = db
			.query("SELECT id, projectId, rank FROM issue ORDER BY projectId, rank")
			.all() as { id: string; projectId: string; rank: string }[];
		const project = ranked.filter((row) => row.projectId === "P");
		expect(project.map((row) => row.id)).toEqual(
			Array.from({ length: 70 }, (_, n) => `P-${69 - n}`),
		);
		expect(new Set(project.map((row) => row.rank)).size).toBe(70);
		// Each one is a key the library builds on.
		for (const row of ranked) {
			expect(generateKeyBetween(row.rank, null) > row.rank).toBe(true);
		}
	});
});
