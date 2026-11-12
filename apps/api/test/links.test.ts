import { beforeAll, describe, expect, test } from "bun:test";
import { createRouterClient } from "@orpc/server";

// Imported dynamically so setup.ts points the database at a temp file first.
await import("./setup");
const { Auth } = await import("@smelp/auth");
const { DB } = await import("@smelp/db");
const { router } = await import("../src/router");

const sql = new DB().sqlite;
const auth = new Auth();

const WORKSPACE = "link_tests";
const PROJECT = "LNK";

function first<T>(items: T[]): T {
	const [item] = items;
	if (item === undefined) throw new Error("Expected at least one item");
	return item;
}

const expectCode = (call: Promise<unknown>, code: string) =>
	expect(call).rejects.toMatchObject({ code });

let userCount = 0;
async function createUser(name: string) {
	userCount += 1;
	const { session, user } = await auth.signUp(
		`lk-${name}-${userCount}@example.test`,
		name,
		`lk-${name}-${userCount}`,
		"correct-horse-battery",
	);
	const headers = new Headers({
		cookie: `auth_session=${session.authSessionToken}`,
	});
	return {
		id: user.id,
		client: createRouterClient(router, {
			context: { headers, ip: "198.51.100.11" },
		}),
	};
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

let admin: User;
let member: User;
let guest: User;
let outsider: User;
let stateIds: string[];

const newIssue = () => ({
	title: "Linked item",
	description: "",
	state: first(stateIds),
	type: "task",
	workspaceId: WORKSPACE,
	projectId: PROJECT,
});

beforeAll(async () => {
	admin = await createUser("admin");
	member = await createUser("member");
	guest = await createUser("guest");
	outsider = await createUser("outsider");

	await admin.client.workspace.create({ name: "Link tests" });
	await admin.client.project.create({
		id: PROJECT,
		name: "Links",
		description: "",
		access: "private",
		icon: "AppWindowIcon",
		workspaceId: WORKSPACE,
	});
	await addMember(WORKSPACE, member.id, "member");
	await addMember(PROJECT, member.id, "member");
	await addMember(PROJECT, guest.id, "guest");

	stateIds = (await admin.client.states.find({ projectId: PROJECT })).map(
		(state) => state.id,
	);
});

describe("links", () => {
	test("add, list, edit and remove", async () => {
		const issue = await member.client.issue.create(newIssue());
		const link = await member.client.links.create({
			issueId: issue.id,
			url: "  https://example.com/a  ",
			title: "  Docs  ",
		});
		expect(link).toMatchObject({
			url: "https://example.com/a",
			title: "Docs",
			createdBy: member.id,
		});

		const untitled = await member.client.links.create({
			issueId: issue.id,
			url: "http://example.com/b",
			title: "   ",
		});
		expect(untitled.title).toBeNull();

		const listed = await guest.client.links.find({ issueId: issue.id });
		expect(listed.map((l) => l.id)).toEqual([link.id, untitled.id]);

		const edited = await member.client.links.update({
			id: link.id,
			url: "https://example.com/c",
		});
		expect(edited).toMatchObject({ url: "https://example.com/c", title: null });

		await member.client.links.delete({ id: link.id });
		const left = await member.client.links.find({ issueId: issue.id });
		expect(left.map((l) => l.id)).toEqual([untitled.id]);
		await expectCode(member.client.links.delete({ id: link.id }), "NOT_FOUND");
	});

	test("only http and https links are accepted", async () => {
		const issue = await member.client.issue.create(newIssue());
		for (const url of [
			"javascript:alert(1)",
			"JaVaScRiPt:alert(1)",
			"data:text/html,hi",
			"file:///etc/passwd",
			"ftp://example.com",
			"example.com",
			"",
			"   ",
		]) {
			await expectCode(
				member.client.links.create({ issueId: issue.id, url }),
				"BAD_REQUEST",
			);
		}
		const link = await member.client.links.create({
			issueId: issue.id,
			url: "https://example.com",
		});
		await expectCode(
			member.client.links.update({ id: link.id, url: "javascript:void(0)" }),
			"BAD_REQUEST",
		);
	});

	test("length limits", async () => {
		const issue = await member.client.issue.create(newIssue());
		await expectCode(
			member.client.links.create({
				issueId: issue.id,
				url: `https://example.com/${"a".repeat(2_000)}`,
			}),
			"BAD_REQUEST",
		);
		await expectCode(
			member.client.links.create({
				issueId: issue.id,
				url: "https://example.com",
				title: "t".repeat(201),
			}),
			"BAD_REQUEST",
		);
	});

	test("guests and outsiders cannot change links; outsiders cannot read", async () => {
		const issue = await member.client.issue.create(newIssue());
		const link = await member.client.links.create({
			issueId: issue.id,
			url: "https://example.com",
		});
		for (const user of [guest, outsider]) {
			await expectCode(
				user.client.links.create({ issueId: issue.id, url: "https://x.test" }),
				"FORBIDDEN",
			);
			await expectCode(
				user.client.links.update({ id: link.id, url: "https://x.test" }),
				"FORBIDDEN",
			);
			await expectCode(user.client.links.delete({ id: link.id }), "FORBIDDEN");
		}
		await expectCode(
			outsider.client.links.find({ issueId: issue.id }),
			"FORBIDDEN",
		);
	});

	test("archived projects are read-only", async () => {
		const issue = await member.client.issue.create(newIssue());
		const link = await member.client.links.create({
			issueId: issue.id,
			url: "https://example.com",
		});
		await admin.client.project.archive({ projectId: PROJECT });
		try {
			const archived = (call: Promise<unknown>) =>
				expect(call).rejects.toMatchObject({
					code: "FORBIDDEN",
					message: "This project is archived",
				});
			await archived(
				member.client.links.create({
					issueId: issue.id,
					url: "https://a.test",
				}),
			);
			await archived(
				member.client.links.update({ id: link.id, url: "https://a.test" }),
			);
			await archived(member.client.links.delete({ id: link.id }));
			expect(
				await member.client.links.find({ issueId: issue.id }),
			).toHaveLength(1);
		} finally {
			await admin.client.project.unarchive({ projectId: PROJECT });
		}
	});

	test("deleting a work item removes its links", async () => {
		const issue = await member.client.issue.create(newIssue());
		await member.client.links.create({
			issueId: issue.id,
			url: "https://example.com",
		});
		await member.client.issue.delete({ id: issue.id });
		const rows = (await sql`
			SELECT id FROM issue_link WHERE issueId = ${issue.id}
		`) as unknown[];
		expect(rows).toHaveLength(0);
	});

	test("changes are logged on the work item", async () => {
		const issue = await member.client.issue.create(newIssue());
		const link = await member.client.links.create({
			issueId: issue.id,
			url: "https://example.com",
		});
		await member.client.links.update({
			id: link.id,
			url: "https://example.org",
		});
		// No change, no event.
		await member.client.links.update({
			id: link.id,
			url: "https://example.org",
		});
		await member.client.links.delete({ id: link.id });

		// Events are logged asynchronously.
		await Bun.sleep(50);
		const activity = await member.client.activity.findForIssue({
			issueId: issue.id,
		});
		expect(activity.map((entry) => entry.action)).toEqual([
			"created",
			"issue.link_added",
			"issue.link_updated",
			"issue.link_removed",
		]);
	});
});
