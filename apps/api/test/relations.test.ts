import { beforeAll, describe, expect, test } from "bun:test";
import { createRouterClient } from "@orpc/server";

// Imported dynamically so setup.ts points the database at a temp file first.
await import("./setup");
const { Auth } = await import("@smelp/auth");
const { DB } = await import("@smelp/db");
const { router } = await import("../src/router");

const sql = new DB().sqlite;
const auth = new Auth();

const WORKSPACE = "relation_tests";
const OTHER_WORKSPACE = "relation_elsewhere";
const ALPHA = "RLA";
const BETA = "RLB";
const SECRET = "RLS";
const ELSEWHERE = "RLX";

function clientFor(token?: string) {
	const headers = new Headers(
		token ? { cookie: `auth_session=${token}` } : undefined,
	);
	return createRouterClient(router, {
		context: { headers, ip: "198.51.100.30" },
	});
}

let userCount = 0;
async function createUser(name: string) {
	userCount += 1;
	const { session, user } = await auth.signUp(
		`relation-${name}-${userCount}@example.test`,
		name,
		`relation-${name}-${userCount}`,
		"correct-horse-battery",
	);
	return { id: user.id, client: clientFor(session.authSessionToken) };
}
type User = Awaited<ReturnType<typeof createUser>>;

async function addMember(spaceId: string, userId: string, role: string) {
	const member = {
		id: crypto.randomUUID(),
		spaceId,
		userId,
		role,
		createdAt: Date.now(),
	};
	await sql`INSERT INTO auth_space_member ${sql(member)}`;
}

const expectCode = (call: Promise<unknown>, code: string) =>
	expect(call).rejects.toMatchObject({ code });

let owner: User;
let otherOwner: User;
let guest: User;
let betaOnly: User;

async function createProject(
	user: User,
	workspaceId: string,
	id: string,
	access: "public" | "private",
) {
	await user.client.project.create({
		id,
		name: `Project ${id}`,
		description: "",
		access,
		icon: "AppWindowIcon",
		workspaceId,
	});
}

async function createIssue(
	user: User,
	workspaceId: string,
	projectId: string,
	title: string,
) {
	const [state] = await user.client.states.find({ projectId });
	if (!state) throw new Error("Expected a state");
	const issue = await user.client.issue.create({
		title,
		description: "",
		state: state.id,
		type: "task",
		workspaceId,
		projectId,
	});
	return issue.id;
}

const relationsOf = (user: User, issueId: string) =>
	user.client.issueRelations.find({ issueId });

beforeAll(async () => {
	owner = await createUser("owner");
	otherOwner = await createUser("other");
	guest = await createUser("guest");
	betaOnly = await createUser("betaonly");

	await owner.client.workspace.create({ name: "Relation tests" });
	await createProject(owner, WORKSPACE, ALPHA, "public");
	await createProject(owner, WORKSPACE, BETA, "public");
	await createProject(owner, WORKSPACE, SECRET, "private");
	await otherOwner.client.workspace.create({ name: "Relation elsewhere" });
	await createProject(otherOwner, OTHER_WORKSPACE, ELSEWHERE, "public");
	await addMember(OTHER_WORKSPACE, owner.id, "member");
	await addMember(ELSEWHERE, owner.id, "member");

	await addMember(WORKSPACE, guest.id, "guest");
	await addMember(ALPHA, guest.id, "guest");
	await addMember(WORKSPACE, betaOnly.id, "member");
	await addMember(BETA, betaOnly.id, "member");
});

describe("issue relations", () => {
	test("shows each relation from both sides with the inverse label", async () => {
		const a = await createIssue(owner, WORKSPACE, ALPHA, "Blocker");
		const b = await createIssue(owner, WORKSPACE, BETA, "Blocked");
		await owner.client.issueRelations.add({
			issueId: a,
			relatedId: b,
			kind: "blocks",
		});

		const fromA = await relationsOf(owner, a);
		expect(fromA).toHaveLength(1);
		expect(fromA[0]).toMatchObject({
			kind: "blocks",
			issue: { id: b, title: "Blocked", projectId: BETA },
		});
		const fromB = await relationsOf(owner, b);
		expect(fromB[0]).toMatchObject({ kind: "blocked_by", issue: { id: a } });
	});

	test("maps each kind to its inverse", async () => {
		const pairs = [
			["blocked_by", "blocks"],
			["relates", "relates"],
			["duplicates", "duplicated_by"],
			["duplicated_by", "duplicates"],
		] as const;
		for (const [kind, inverse] of pairs) {
			const a = await createIssue(owner, WORKSPACE, ALPHA, `A ${kind}`);
			const b = await createIssue(owner, WORKSPACE, ALPHA, `B ${kind}`);
			await owner.client.issueRelations.add({
				issueId: a,
				relatedId: b,
				kind,
			});
			expect((await relationsOf(owner, a))[0]?.kind).toBe(kind);
			expect((await relationsOf(owner, b))[0]?.kind).toBe(inverse);
		}
	});

	test("rejects a relation to itself", async () => {
		const a = await createIssue(owner, WORKSPACE, ALPHA, "Lonely");
		await expectCode(
			owner.client.issueRelations.add({
				issueId: a,
				relatedId: a,
				kind: "relates",
			}),
			"BAD_REQUEST",
		);
	});

	test("rejects a second relation between the same two items, either way round", async () => {
		const a = await createIssue(owner, WORKSPACE, ALPHA, "Dup one");
		const b = await createIssue(owner, WORKSPACE, ALPHA, "Dup two");
		await owner.client.issueRelations.add({
			issueId: a,
			relatedId: b,
			kind: "blocks",
		});
		await expectCode(
			owner.client.issueRelations.add({
				issueId: a,
				relatedId: b,
				kind: "blocks",
			}),
			"CONFLICT",
		);
		await expectCode(
			owner.client.issueRelations.add({
				issueId: b,
				relatedId: a,
				kind: "blocks",
			}),
			"CONFLICT",
		);
		await expectCode(
			owner.client.issueRelations.add({
				issueId: b,
				relatedId: a,
				kind: "relates",
			}),
			"CONFLICT",
		);
		expect(await relationsOf(owner, a)).toHaveLength(1);
	});

	test("rejects items from another workspace and unknown items", async () => {
		const a = await createIssue(owner, WORKSPACE, ALPHA, "Home");
		const x = await createIssue(owner, OTHER_WORKSPACE, ELSEWHERE, "Away");
		await expectCode(
			owner.client.issueRelations.add({
				issueId: a,
				relatedId: x,
				kind: "relates",
			}),
			"BAD_REQUEST",
		);
		await expectCode(
			owner.client.issueRelations.add({
				issueId: a,
				relatedId: "NOPE-1",
				kind: "relates",
			}),
			"NOT_FOUND",
		);
	});

	test("can be removed from either side, and the other side loses it", async () => {
		const a = await createIssue(owner, WORKSPACE, ALPHA, "Remove one");
		const b = await createIssue(owner, WORKSPACE, ALPHA, "Remove two");
		await owner.client.issueRelations.add({
			issueId: a,
			relatedId: b,
			kind: "relates",
		});
		const [relation] = await relationsOf(owner, b);
		if (!relation) throw new Error("Expected a relation");
		await owner.client.issueRelations.remove({
			issueId: b,
			id: relation.id,
		});
		expect(await relationsOf(owner, a)).toEqual([]);
		expect(await relationsOf(owner, b)).toEqual([]);
		await expectCode(
			owner.client.issueRelations.remove({ issueId: b, id: relation.id }),
			"NOT_FOUND",
		);
	});

	test("deleting an item removes its relations", async () => {
		const a = await createIssue(owner, WORKSPACE, ALPHA, "Keeper");
		const b = await createIssue(owner, WORKSPACE, ALPHA, "Goner");
		await owner.client.issueRelations.add({
			issueId: a,
			relatedId: b,
			kind: "blocks",
		});
		await owner.client.issue.delete({ id: b });
		expect(await relationsOf(owner, a)).toEqual([]);
		const rows = await sql`
			SELECT id FROM issue_relation WHERE sourceId = ${b} OR targetId = ${b}
		`;
		expect(rows).toHaveLength(0);
	});

	test("guests can read relations but not change them", async () => {
		const a = await createIssue(owner, WORKSPACE, ALPHA, "Guest one");
		const b = await createIssue(owner, WORKSPACE, ALPHA, "Guest two");
		await expectCode(
			guest.client.issueRelations.add({
				issueId: a,
				relatedId: b,
				kind: "relates",
			}),
			"FORBIDDEN",
		);
		await owner.client.issueRelations.add({
			issueId: a,
			relatedId: b,
			kind: "relates",
		});
		const seen = await relationsOf(guest, a);
		expect(seen).toHaveLength(1);
		await expectCode(
			guest.client.issueRelations.remove({
				issueId: a,
				id: seen[0]?.id ?? "",
			}),
			"FORBIDDEN",
		);
	});

	test("hides items in projects the caller can't read", async () => {
		const a = await createIssue(owner, WORKSPACE, BETA, "Visible");
		const secret = await createIssue(owner, WORKSPACE, SECRET, "Hidden");
		await owner.client.issueRelations.add({
			issueId: a,
			relatedId: secret,
			kind: "relates",
		});
		expect(await relationsOf(owner, a)).toHaveLength(1);
		expect(await relationsOf(betaOnly, a)).toEqual([]);
		// Can't relate to what they can't read either.
		const b = await createIssue(owner, WORKSPACE, BETA, "Another visible");
		await expectCode(
			betaOnly.client.issueRelations.add({
				issueId: b,
				relatedId: secret,
				kind: "relates",
			}),
			"FORBIDDEN",
		);
	});

	test("archived projects are read-only on either side", async () => {
		const archived = await createIssue(owner, WORKSPACE, SECRET, "Frozen");
		const open = await createIssue(owner, WORKSPACE, ALPHA, "Open");
		const linked = await createIssue(owner, WORKSPACE, ALPHA, "Linked");
		await owner.client.issueRelations.add({
			issueId: open,
			relatedId: linked,
			kind: "relates",
		});
		await owner.client.issueRelations.add({
			issueId: archived,
			relatedId: open,
			kind: "blocks",
		});
		const [toArchived] = (await relationsOf(owner, open)).filter(
			(r) => r.issue.id === archived,
		);
		if (!toArchived) throw new Error("Expected a relation");

		await owner.client.project.archive({ projectId: SECRET });
		try {
			const other = await createIssue(owner, WORKSPACE, BETA, "Other");
			await expectCode(
				owner.client.issueRelations.add({
					issueId: archived,
					relatedId: other,
					kind: "relates",
				}),
				"FORBIDDEN",
			);
			await expectCode(
				owner.client.issueRelations.add({
					issueId: other,
					relatedId: archived,
					kind: "relates",
				}),
				"FORBIDDEN",
			);
			await expectCode(
				owner.client.issueRelations.remove({
					issueId: open,
					id: toArchived.id,
				}),
				"FORBIDDEN",
			);
			// Still listed.
			expect(await relationsOf(owner, archived)).toHaveLength(1);
		} finally {
			await owner.client.project.unarchive({ projectId: SECRET });
		}
	});

	test("logs adding and removing a relation", async () => {
		const a = await createIssue(owner, WORKSPACE, ALPHA, "Logged one");
		const b = await createIssue(owner, WORKSPACE, ALPHA, "Logged two");
		await owner.client.issueRelations.add({
			issueId: a,
			relatedId: b,
			kind: "blocked_by",
		});
		const [relation] = await relationsOf(owner, a);
		if (!relation) throw new Error("Expected a relation");
		await owner.client.issueRelations.remove({ issueId: a, id: relation.id });
		await Bun.sleep(30);

		const rows = (await sql`
			SELECT action, oldValue, newValue, metadata FROM activity_logs
			WHERE entityType = 'issue' AND entityId = ${a}
				AND action LIKE 'issue.relation_%'
			ORDER BY createdAt, rowid
		`) as {
			action: string;
			oldValue: string | null;
			newValue: string | null;
			metadata: string;
		}[];
		expect(rows.map((row) => row.action)).toEqual([
			"issue.relation_added",
			"issue.relation_removed",
		]);
		expect(rows[0]).toMatchObject({ oldValue: null, newValue: "blocked_by" });
		expect(rows[1]).toMatchObject({ oldValue: "blocked_by", newValue: null });
		expect(JSON.parse(rows[0]?.metadata ?? "{}")).toMatchObject({
			projectId: ALPHA,
			relatedId: b,
		});
	});
});
