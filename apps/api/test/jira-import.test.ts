import { beforeAll, describe, expect, test } from "bun:test";
import { createRouterClient } from "@orpc/server";

// Imported dynamically so setup.ts points the database at a temp file first.
await import("./setup");
const { Auth } = await import("@smelp/auth");
const { DB } = await import("@smelp/db");
const { router } = await import("../src/router");

const sql = new DB().sqlite;
const auth = new Auth();

const WORKSPACE = "jira_import_tests";

function clientFor(token?: string) {
	const headers = new Headers(
		token ? { cookie: `auth_session=${token}` } : undefined,
	);
	return createRouterClient(router, {
		context: { headers, ip: "198.51.100.41" },
	});
}

let userCount = 0;
async function createUser(name: string) {
	userCount += 1;
	const { session, user } = await auth.signUp(
		`jira-${name.replace(/\s/g, "")}-${userCount}@example.test`,
		name,
		name,
		"correct-horse-battery",
	);
	return { id: user.id, client: clientFor(session.authSessionToken) };
}
type User = Awaited<ReturnType<typeof createUser>>;

async function addMember(spaceId: string, userId: string, role: string) {
	await sql`INSERT INTO auth_space_member ${sql({
		id: crypto.randomUUID(),
		spaceId,
		userId,
		role,
		createdAt: Date.now(),
	})}`;
}

const expectCode = (call: Promise<unknown>, code: string) =>
	expect(call).rejects.toMatchObject({ code });

// Events are written by a subscriber after the call returns, so wait for the row.
async function waitFor<T>(read: () => Promise<T | undefined>): Promise<T> {
	for (let i = 0; i < 200; i++) {
		const value = await read();
		if (value !== undefined) return value;
		await Bun.sleep(10);
	}
	throw new Error("Timed out waiting for the activity log");
}

// ---- Fixtures: shaped like Jira Cloud's "Export Excel CSV (all fields)" ----------

const HEADER = [
	"Summary",
	"Issue key",
	"Issue id",
	"Issue Type",
	"Status",
	"Project key",
	"Project name",
	"Project type",
	"Project lead",
	"Project description",
	"Priority",
	"Resolution",
	"Assignee",
	"Assignee Id",
	"Reporter",
	"Reporter Id",
	"Created",
	"Updated",
	"Labels",
	"Labels",
	"Description",
	"Status Category",
	"Outward issue link (Blocks)",
	"Outward issue link (Duplicate)",
	"Outward issue link (Relates)",
	"Outward issue link (Cloners)",
	"Inward issue link (Blocks)",
	"Inward issue link (Duplicate)",
	"Inward issue link (Relates)",
	"Attachment",
	"Comment",
	"Comment",
	"Comment",
	"Parent id",
	"Parent",
];

type Row = {
	summary: string;
	key: string;
	/** Defaults to the key's prefix; differs for items moved between projects. */
	projectKey?: string;
	id?: string;
	type?: string;
	status?: string;
	projectName?: string;
	projectDescription?: string;
	priority?: string;
	assignee?: [name: string, id: string];
	reporter?: [name: string, id: string];
	created?: string;
	description?: string;
	category?: string;
	labels?: string[];
	/** Cell values by column header, e.g. "Outward issue link (Blocks)". */
	cells?: Record<string, string>;
	comments?: string[];
	attachments?: string;
	parent?: [id: string, key: string];
};

function quote(value: string) {
	return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

// Repeated headers are filled left to right, like the real export does.
function jiraCsv(rows: Row[], options: { bom?: boolean; eol?: string } = {}) {
	const { bom = true, eol = "\r\n" } = options;
	const lines = rows.map((row) => {
		const cells = new Array<string>(HEADER.length).fill("");
		const put = (header: string, value: string | undefined, nth = 0) => {
			let seen = 0;
			for (let i = 0; i < HEADER.length; i++) {
				if (HEADER[i] !== header) continue;
				if (seen++ === nth) {
					cells[i] = value ?? "";
					return;
				}
			}
			throw new Error(`No column ${header} #${nth}`);
		};
		const projectKey = row.projectKey ?? (row.key.split("-")[0] as string);
		put("Summary", row.summary);
		put("Issue key", row.key);
		put("Issue id", row.id);
		put("Issue Type", row.type ?? "Task");
		put("Status", row.status ?? "To Do");
		put("Project key", projectKey);
		put("Project name", row.projectName ?? `Project ${projectKey}`);
		put("Project type", "software");
		put("Project description", row.projectDescription);
		put("Priority", row.priority ?? "Medium");
		put("Assignee", row.assignee?.[0]);
		put("Assignee Id", row.assignee?.[1]);
		put("Reporter", row.reporter?.[0]);
		put("Reporter Id", row.reporter?.[1]);
		put("Created", row.created ?? "12/Nov/24 10:15 AM");
		put("Updated", "13/Nov/24 11:00 AM");
		for (const [nth, label] of (row.labels ?? []).entries()) {
			put("Labels", label, nth);
		}
		put("Description", row.description);
		put("Status Category", row.category ?? "To Do");
		for (const [header, value] of Object.entries(row.cells ?? {})) {
			put(header, value);
		}
		put("Attachment", row.attachments);
		for (const [nth, comment] of (row.comments ?? []).entries()) {
			put("Comment", comment, nth);
		}
		put("Parent id", row.parent?.[0]);
		put("Parent", row.parent?.[1]);
		return cells.map(quote).join(",");
	});
	return (
		(bom ? "﻿" : "") + [HEADER.map(quote).join(","), ...lines].join(eol) + eol
	);
}

// ZQA / ZQB: the main export. Projects, sub-tasks, links, comments, users.
function mainExport() {
	return jiraCsv([
		{
			summary: "Set up login, with SSO",
			key: "ZQA-1",
			id: "10001",
			type: "Story",
			status: "In Progress",
			category: "In Progress",
			projectName: "Zephyr Alpha",
			projectDescription: "The first one",
			assignee: ["Ada Lovelace", "acc-ada"],
			reporter: ["Grace Hopper", "acc-grace"],
			labels: ["backend", "auth"],
			description:
				'He said "hi"\nSecond line, with a comma\n<script>alert(1)</script>\nPing [~accountid:acc-ada]',
			cells: {
				"Outward issue link (Blocks)": "ZQA-2",
				"Outward issue link (Relates)": "ZQB-1",
				"Outward issue link (Cloners)": "ZQB-1",
			},
			attachments:
				"13/Nov/24 9:00 AM;Ada;spec.pdf;https://jira.example/secure/attachment/1/spec.pdf",
			comments: [
				"13/Nov/24 9:00 AM;acc-ada;Looks good; ship it",
				"14/Nov/24 4:30 PM;acc-zed;Question\nsecond line",
			],
		},
		{
			summary: "Blocked thing",
			key: "ZQA-2",
			id: "10002",
			type: "Bug",
			status: "Won't Do",
			category: "Done",
			projectName: "Zephyr Alpha",
			assignee: ["Ada Lovelace", "acc-ada"],
			cells: { "Inward issue link (Blocks)": "ZQA-1" },
		},
		{
			summary: "Child task",
			key: "ZQA-3",
			id: "10003",
			type: "Sub-task",
			status: "Done",
			category: "Done",
			projectName: "Zephyr Alpha",
			parent: ["10001", "ZQA-1"],
			cells: { "Outward issue link (Duplicate)": "ZQA-2" },
		},
		{
			summary: "Look elsewhere",
			key: "ZQA-7",
			id: "10007",
			status: "Backlog",
			projectName: "Zephyr Alpha",
			cells: { "Outward issue link (Blocks)": "ZQC-9" },
		},
		{
			summary: `A very long title ${"x".repeat(200)}`,
			key: "ZQA-8",
			id: "10008",
			projectName: "Zephyr Alpha",
			description: "d".repeat(25_000),
			comments: [`14/Nov/24 4:30 PM;acc-ada;${"c".repeat(12_000)}`],
		},
		{
			summary: "Beta thing",
			key: "ZQB-1",
			id: "20001",
			status: "To Do",
			projectName: "Zephyr Beta",
			assignee: ["Nobody Known", "acc-nobody"],
		},
	]);
}

let admin: User;
let ada: User;
let grace: User;
let plain: User;
let guest: User;
let stranger: User;
let outsider: User;

const count = async (table: string, where = "1 = 1") =>
	(
		(
			await sql.unsafe(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`)
		)[0] as {
			n: number;
		}
	).n;

beforeAll(async () => {
	admin = await createUser("Jira Admin");
	ada = await createUser("Ada Lovelace");
	grace = await createUser("Grace Hopper");
	plain = await createUser("Plain Member");
	guest = await createUser("Jira Guest");
	stranger = await createUser("Jira Stranger");
	outsider = await createUser("Jira Outsider");

	await admin.client.workspace.create({ name: "Jira import tests" });
	await addMember(WORKSPACE, ada.id, "member");
	await addMember(WORKSPACE, grace.id, "admin");
	await addMember(WORKSPACE, plain.id, "member");
	await addMember(WORKSPACE, guest.id, "guest");
	await addMember(WORKSPACE, stranger.id, "member");
	await outsider.client.workspace.create({ name: "Jira import elsewhere" });
});

describe("jira import: who may use it", () => {
	test("only workspace admins", async () => {
		const csv = mainExport();
		await expectCode(
			clientFor().jiraImport.preview({ workspaceId: WORKSPACE, csv }),
			"UNAUTHORIZED",
		);
		for (const user of [plain, guest, outsider]) {
			await expectCode(
				user.client.jiraImport.preview({ workspaceId: WORKSPACE, csv }),
				"FORBIDDEN",
			);
			await expectCode(
				user.client.jiraImport.apply({
					workspaceId: WORKSPACE,
					csv,
					mapping: {},
				}),
				"FORBIDDEN",
			);
		}
		await expectCode(
			admin.client.jiraImport.preview({
				workspaceId: "no_such_workspace",
				csv,
			}),
			"NOT_FOUND",
		);
		expect(await count("project", "id LIKE 'ZQ%'")).toBe(0);
	});
});

describe("jira import: dry run", () => {
	test("shows what would be created and saves nothing", async () => {
		const before = await count("issue");
		const plan = await admin.client.jiraImport.preview({
			workspaceId: WORKSPACE,
			csv: mainExport(),
		});

		expect(plan.errors).toEqual([]);
		expect(plan.totals).toMatchObject({
			projects: 2,
			workItems: 6,
			subItems: 1,
			comments: 3,
		});
		const alpha = plan.projects.find((p) => p.jiraKey === "ZQA");
		expect(alpha).toMatchObject({
			id: "ZQA",
			name: "Zephyr Alpha",
			include: true,
			idProblem: null,
			workItems: 5,
			subItems: 1,
			comments: 3,
			access: "private",
		});
		// ZQA-1/2 blocks, ZQA-3/2 duplicate, ZQA-1/ZQB-1 relates.
		expect(plan.totals.relations).toBe(3);
		expect(alpha?.states).toEqual([
			"Backlog",
			"Todo",
			"In Progress",
			"Done",
			"Cancelled",
		]);

		const targets = Object.fromEntries(
			plan.statuses.map((s) => [s.name, s.target]),
		);
		expect(targets).toEqual({
			"In Progress": "in_progress",
			"Won't Do": "cancelled",
			Done: "done",
			Backlog: "backlog",
			"To Do": "todo",
		});

		const byName = Object.fromEntries(plan.users.map((u) => [u.name, u]));
		expect(byName["Ada Lovelace"]).toMatchObject({
			userId: ada.id,
			matchedBy: "name",
			assigned: 2,
		});
		expect(byName["Grace Hopper"]).toMatchObject({ userId: grace.id });
		expect(byName["Nobody Known"]).toMatchObject({ userId: null });
		expect(byName["acc-zed"]).toMatchObject({ userId: null, comments: 1 });

		const warnings = plan.warnings.join("\n");
		expect(warnings).toContain("1 attachment(s) are not imported");
		expect(warnings).toContain(
			"1 issue link(s) point to items that aren't part of this import",
		);
		expect(warnings).toContain('imported as "relates": Cloners');

		// Guests can't be given work, so they aren't offered.
		expect(plan.candidates.map((c) => c.id)).not.toContain(guest.id);
		expect(plan.candidates.map((c) => c.id)).toContain(plain.id);

		expect(await count("issue")).toBe(before);
		expect(await count("project", "id LIKE 'ZQ%'")).toBe(0);
	});

	test("reads LF files without a BOM the same way", async () => {
		const plan = await admin.client.jiraImport.preview({
			workspaceId: WORKSPACE,
			csv: jiraCsv(
				[{ summary: "Only", key: "ZQL-1", projectName: "Unix export" }],
				{ bom: false, eol: "\n" },
			),
		});
		expect(plan.totals.workItems).toBe(1);
		expect(plan.projects[0]?.jiraKey).toBe("ZQL");
	});

	test("matches users by email when the export has one", async () => {
		const plan = await admin.client.jiraImport.preview({
			workspaceId: WORKSPACE,
			csv: jiraCsv([
				{
					summary: "By email",
					key: "ZQM-1",
					assignee: [`Someone Else`, `JIRA-Plain Member-4@EXAMPLE.test`],
				},
			]),
		});
		expect(plan.users[0]).toMatchObject({ userId: null });

		const email = (
			(await sql`SELECT email FROM auth_user WHERE id = ${plain.id}`)[0] as {
				email: string;
			}
		).email;
		const matched = await admin.client.jiraImport.preview({
			workspaceId: WORKSPACE,
			csv: jiraCsv([
				{
					summary: "By email",
					key: "ZQM-1",
					assignee: ["Someone Else", email.toUpperCase()],
				},
			]),
		});
		expect(matched.users[0]).toMatchObject({
			userId: plain.id,
			matchedBy: "email",
		});
	});

	test("refuses files that aren't Jira exports or are too big", async () => {
		const preview = (csv: string) =>
			admin.client.jiraImport.preview({ workspaceId: WORKSPACE, csv });
		await expectCode(preview(""), "BAD_REQUEST");
		await expectCode(preview("name,age\nAda,36\n"), "BAD_REQUEST");
		await expectCode(preview(`${HEADER.join(",")}\n`), "BAD_REQUEST");
		await expectCode(
			preview('Summary,"Issue key",Status\n"x,ZQN-1,Open'),
			"BAD_REQUEST",
		);
		await expectCode(
			preview(`Summary,Issue key,Status\n${"s,ZQN-1,Open\n".repeat(20_001)}`),
			"BAD_REQUEST",
		);
		// Over the file size limit, caught before parsing.
		await expectCode(preview("x".repeat(10 * 1024 * 1024 + 1)), "BAD_REQUEST");
		await expect(
			preview("Summary,Issue key,Status\ns,nokey,Open\n"),
		).rejects.toThrow(/No work items/);
	});
});

describe("jira import: apply", () => {
	let ids: string[];

	test("creates the projects, items, comments and relations", async () => {
		const result = await admin.client.jiraImport.apply({
			workspaceId: WORKSPACE,
			csv: mainExport(),
			mapping: {
				projects: { ZQB: { access: "public" } },
				jiraBaseUrl: "https://example.atlassian.net/jira/software",
			},
		});
		ids = result.projects.map((p) => p.id);
		expect(ids).toEqual(["ZQA", "ZQB"]);
		expect(result.totals.workItems).toBe(6);

		const project = (await sql`SELECT * FROM project WHERE id = 'ZQA'`)[0] as {
			name: string;
			access: string;
			workspaceId: string;
			createdBy: string;
		};
		expect(project).toMatchObject({
			name: "Zephyr Alpha",
			access: "private",
			workspaceId: WORKSPACE,
			createdBy: admin.id,
		});
		expect(
			(
				(
					await sql`SELECT lastNumber FROM project_counter WHERE projectId = 'ZQA'`
				)[0] as {
					lastNumber: number;
				}
			).lastNumber,
		).toBe(8);

		// Items keep their Jira numbers, and the next new item continues after them.
		const next = await admin.client.issue.create({
			title: "After the import",
			description: "",
			state: (
				(await admin.client.states.find({ projectId: "ZQA" }))[0] as {
					id: string;
				}
			).id,
			type: "task",
			workspaceId: WORKSPACE,
			projectId: "ZQA",
		});
		expect(next.id).toBe("ZQA-9");

		const one = await admin.client.issue.find({ issueId: "ZQA-1" });
		expect(one).toMatchObject({
			title: "Set up login, with SSO",
			assignee: ada.id,
			createdBy: grace.id,
			workspaceId: WORKSPACE,
			type: "task",
			createdAt: Date.parse("2024-11-12T10:15:00Z"),
			updatedAt: Date.parse("2024-11-13T11:00:00Z"),
		});
		// Text stays text: nothing is stripped or interpreted, and the Jira key is kept.
		expect(one.description).toContain(
			'He said "hi"\nSecond line, with a comma',
		);
		expect(one.description).toContain("<script>alert(1)</script>");
		expect(one.description).toContain("Ping @Ada Lovelace");
		expect(one.description).toContain("Imported from Jira: ZQA-1");
		expect(one.description).toContain("Jira status: In Progress");
		expect(one.description).toContain("Labels: backend, auth");
		expect(one.description).toContain("Attachments in Jira (not imported): 1");
		expect(one.description).not.toContain("spec.pdf");

		const states = await admin.client.states.find({ projectId: "ZQA" });
		const stateName = (id: string) => states.find((s) => s.id === id)?.name;
		expect(stateName(one.state)).toBe("In Progress");
		expect(
			stateName((await admin.client.issue.find({ issueId: "ZQA-2" })).state),
		).toBe("Cancelled");
		expect(
			stateName((await admin.client.issue.find({ issueId: "ZQA-7" })).state),
		).toBe("Backlog");
		expect(
			(await admin.client.issue.find({ issueId: "ZQA-7" })).description,
		).toContain("Jira link (Blocks, outward): ZQC-9");

		// Sub-task.
		expect((await admin.client.issue.find({ issueId: "ZQA-3" })).parentId).toBe(
			"ZQA-1",
		);
		expect(
			(await admin.client.issue.find({ issueId: "ZQA-1" })).parentId,
		).toBeNull();

		// Caps match what the app itself allows.
		const long = await admin.client.issue.find({ issueId: "ZQA-8" });
		expect(long.title.length).toBe(120);
		expect(long.description.length).toBeLessThanOrEqual(20_000);
		expect(long.description).toContain("[...truncated]");
		expect(long.description).toContain("Imported from Jira: ZQA-8");

		// Relations: one per pair, direction from the link type.
		const rel = async (a: string, b: string) =>
			(await sql`
				SELECT sourceId, targetId, type FROM issue_relation
				WHERE (sourceId = ${a} AND targetId = ${b}) OR (sourceId = ${b} AND targetId = ${a})
			`) as { sourceId: string; targetId: string; type: string }[];
		expect(await rel("ZQA-1", "ZQA-2")).toEqual([
			{ sourceId: "ZQA-1", targetId: "ZQA-2", type: "blocks" },
		]);
		expect(await rel("ZQA-3", "ZQA-2")).toEqual([
			{ sourceId: "ZQA-3", targetId: "ZQA-2", type: "duplicates" },
		]);
		// The relates and Cloners links to the same item collapse into one relation.
		expect(await rel("ZQA-1", "ZQB-1")).toEqual([
			{ sourceId: "ZQA-1", targetId: "ZQB-1", type: "relates" },
		]);
		const seenFrom2 = await admin.client.issueRelations.find({
			issueId: "ZQA-2",
		});
		expect(seenFrom2.map((r) => `${r.kind} ${r.issue.id}`).sort()).toEqual([
			"blocked_by ZQA-1",
			"duplicated_by ZQA-3",
		]);

		// Web links back to Jira.
		const links = await admin.client.links.find({ issueId: "ZQA-1" });
		expect(links).toHaveLength(1);
		expect(links[0]).toMatchObject({
			url: "https://example.atlassian.net/browse/ZQA-1",
			title: "Jira ZQA-1",
		});
	});

	test("keeps comments, naming the author when there is no account for them", async () => {
		const comments = await admin.client.comments.find({ issueId: "ZQA-1" });
		expect(comments).toHaveLength(2);
		expect(comments[0]).toMatchObject({
			authorId: ada.id,
			body: "Looks good; ship it",
			createdAt: Date.parse("2024-11-13T09:00:00Z"),
		});
		expect(comments[1]).toMatchObject({
			authorId: null,
			body: "Comment by acc-zed in Jira:\n\nQuestion\nsecond line",
			createdAt: Date.parse("2024-11-14T16:30:00Z"),
		});
		const long = await admin.client.comments.find({ issueId: "ZQA-8" });
		expect(long[0]?.body.length).toBeLessThanOrEqual(10_000);
	});

	test("unmatched people leave items unassigned, with their name kept", async () => {
		const item = await admin.client.issue.find({ issueId: "ZQB-1" });
		expect(item.assignee).toBeNull();
		expect(item.description).toContain("Jira assignee: Nobody Known");
	});

	test("imported data follows the usual access rules", async () => {
		// Private project: only its members. Ada was assigned, so she is one.
		const members =
			(await sql`SELECT userId, role FROM auth_space_member WHERE spaceId = 'ZQA'`) as {
				userId: string;
				role: string;
			}[];
		expect(members.find((m) => m.userId === admin.id)?.role).toBe("admin");
		expect(members.find((m) => m.userId === ada.id)?.role).toBe("member");
		expect(members.find((m) => m.userId === grace.id)?.role).toBe("member");
		expect(members.find((m) => m.userId === plain.id)).toBeUndefined();

		await expectCode(
			plain.client.issue.find({ issueId: "ZQA-1" }),
			"FORBIDDEN",
		);
		await expectCode(
			plain.client.comments.find({ issueId: "ZQA-1" }),
			"FORBIDDEN",
		);
		expect(
			(await plain.client.projects.find({ workspaceId: WORKSPACE })).map(
				(p) => p.id,
			),
		).not.toContain("ZQA");
		expect((await ada.client.issue.find({ issueId: "ZQA-1" })).id).toBe(
			"ZQA-1",
		);

		// Public project: everyone in the workspace sees it in the list.
		expect(
			(await plain.client.projects.find({ workspaceId: WORKSPACE })).map(
				(p) => p.id,
			),
		).toContain("ZQB");
		// Public projects are joined first, like any other.
		await expectCode(
			plain.client.issue.find({ issueId: "ZQB-1" }),
			"FORBIDDEN",
		);
		await plain.client.project.join({ projectId: "ZQB" });
		expect((await plain.client.issue.find({ issueId: "ZQB-1" })).id).toBe(
			"ZQB-1",
		);

		// Related items in a private project are hidden from people who can't read them.
		const seen = await plain.client.issueRelations.find({ issueId: "ZQB-1" });
		expect(JSON.stringify(seen)).not.toContain("ZQA-1");

		const events = (
			await admin.client.activity.findWorkspace({ workspaceId: WORKSPACE })
		).events;
		expect(JSON.stringify(events)).not.toContain("Set up login");
	});

	test("logs one entry per project, not one per item", async () => {
		const row = await waitFor(async () => {
			const rows = (await sql`
				SELECT * FROM activity_logs WHERE entityId = 'ZQA' AND action = 'project.created'
			`) as { metadata: string; actorId: string }[];
			return rows[0];
		});
		expect(row.actorId).toBe(admin.id);
		expect(JSON.parse(row.metadata)).toMatchObject({
			source: "jira",
			itemCount: 5,
			name: "Zephyr Alpha",
		});
		await waitFor(async () =>
			(await count("activity_logs", "entityId = 'ZQB'")) > 0 ? true : undefined,
		);
		// No issue, comment or member events for imported items; no notifications either.
		expect(
			await count(
				"activity_logs",
				"(entityId LIKE 'ZQA-%' OR entityId LIKE 'ZQB-%') AND entityId <> 'ZQA-9'",
			),
		).toBe(0);
		expect(await count("notification", "projectId IN ('ZQA', 'ZQB')")).toBe(0);

		const feed = (
			await admin.client.activity.findWorkspace({ workspaceId: WORKSPACE })
		).events;
		const imported = feed.find(
			(e) => e.type === "project.created" && e.project?.id === "ZQA",
		);
		expect(imported?.details).toMatchObject({ source: "jira", count: 5 });
	});

	test("importing the same file again is refused and creates nothing", async () => {
		const before = {
			issues: await count("issue"),
			projects: await count("project"),
			spaces: await count("auth_space"),
		};
		const again = (mapping: object) =>
			admin.client.jiraImport.apply({
				workspaceId: WORKSPACE,
				csv: mainExport(),
				mapping,
			});

		await expectCode(again({}), "BAD_REQUEST");
		// A new id doesn't get around it: the Jira projects were already imported.
		await expectCode(
			again({
				projects: {
					ZQA: { id: "ZQAA" },
					ZQB: { id: "ZQBB" },
				},
			}),
			"BAD_REQUEST",
		);
		// The dry run says so too, and leaves them out by default.
		const plan = await admin.client.jiraImport.preview({
			workspaceId: WORKSPACE,
			csv: mainExport(),
		});
		expect(plan.projects.every((p) => !p.include)).toBe(true);
		expect(plan.errors.join(" ")).toContain("Select at least one project");

		const forced = await admin.client.jiraImport.preview({
			workspaceId: WORKSPACE,
			csv: mainExport(),
			mapping: { projects: { ZQA: { include: true, id: "ZQAA" } } },
		});
		expect(forced.projects.find((p) => p.jiraKey === "ZQA")?.idProblem).toBe(
			"imported",
		);
		expect(forced.errors.join(" ")).toContain("already imported");

		expect({
			issues: await count("issue"),
			projects: await count("project"),
			spaces: await count("auth_space"),
		}).toEqual(before);
	});

	test("deleting an imported project allows importing it again", async () => {
		const csv = jiraCsv([
			{ summary: "Again", key: "ZQR-1", projectName: "Redo" },
		]);
		await admin.client.jiraImport.apply({
			workspaceId: WORKSPACE,
			csv,
			mapping: {},
		});
		await expectCode(
			admin.client.jiraImport.apply({
				workspaceId: WORKSPACE,
				csv,
				mapping: {},
			}),
			"BAD_REQUEST",
		);
		await admin.client.project.delete({ projectId: "ZQR" });
		expect(await count("import_record", "projectId = 'ZQR'")).toBe(0);
		await admin.client.jiraImport.apply({
			workspaceId: WORKSPACE,
			csv,
			mapping: {},
		});
		expect(await count("issue", "projectId = 'ZQR'")).toBe(1);
	});
});

describe("jira import: mapping", () => {
	test("the importer can change status, user, id, name and access", async () => {
		const csv = jiraCsv([
			{
				summary: "Mapped",
				key: "ZQK-5",
				status: "In Review",
				category: "In Progress",
				projectName: "Keyed",
				assignee: ["Ada Lovelace", "acc-ada"],
				comments: ["13/Nov/24 9:00 AM;acc-ada;hello"],
			},
		]);
		const plan = await admin.client.jiraImport.preview({
			workspaceId: WORKSPACE,
			csv,
		});
		expect(plan.statuses[0]).toMatchObject({
			name: "In Review",
			target: "in_progress",
		});

		await admin.client.jiraImport.apply({
			workspaceId: WORKSPACE,
			csv,
			mapping: {
				projects: { ZQK: { id: "kk5", name: "Renamed", access: "public" } },
				statuses: { "In Review": "done" },
				users: { "acc-ada": plain.id },
			},
		});
		const project = (await sql`SELECT * FROM project WHERE id = 'KK5'`)[0] as {
			name: string;
			access: string;
		};
		expect(project).toMatchObject({ name: "Renamed", access: "public" });
		const issue = await admin.client.issue.find({ issueId: "KK5-5" });
		expect(issue.assignee).toBe(plain.id);
		const states = await admin.client.states.find({ projectId: "KK5" });
		expect(states.find((s) => s.id === issue.state)?.name).toBe("Done");
		expect(
			(await admin.client.comments.find({ issueId: "KK5-5" }))[0]?.authorId,
		).toBe(plain.id);
		expect(
			await count("import_record", "projectId = 'KK5' AND sourceKey = 'ZQK'"),
		).toBe(1);
	});

	test("an unmatched user can be left alone on purpose", async () => {
		const csv = jiraCsv([
			{
				summary: "Skip",
				key: "ZQU-1",
				projectName: "Unmapped",
				assignee: ["Ada Lovelace", "acc-ada"],
			},
		]);
		await admin.client.jiraImport.apply({
			workspaceId: WORKSPACE,
			csv,
			mapping: { users: { "acc-ada": null } },
		});
		expect(
			(await admin.client.issue.find({ issueId: "ZQU-1" })).assignee,
		).toBeNull();
	});

	test("bad choices are refused with nothing saved", async () => {
		const csv = jiraCsv([
			{
				summary: "One",
				key: "ZQV-1",
				projectName: "First",
				assignee: ["Ada Lovelace", "acc-ada"],
			},
			{ summary: "Two", key: "ZQW-1", projectName: "Second" },
		]);
		const apply = (mapping: object) =>
			admin.client.jiraImport.apply({ workspaceId: WORKSPACE, csv, mapping });
		const before = await count("auth_space");

		// Not a member of this workspace.
		await expectCode(
			apply({ users: { "acc-ada": outsider.id } }),
			"BAD_REQUEST",
		);
		// A guest can't be given work.
		await expectCode(apply({ users: { "acc-ada": guest.id } }), "BAD_REQUEST");
		// Invalid ids.
		await expectCode(apply({ projects: { ZQV: { id: "x" } } }), "BAD_REQUEST");
		await expectCode(
			apply({ projects: { ZQV: { id: "TOOLONG" } } }),
			"BAD_REQUEST",
		);
		await expectCode(
			apply({ projects: { ZQV: { id: "1AB" } } }),
			"BAD_REQUEST",
		);
		await expectCode(
			apply({ projects: { ZQV: { id: "A-B" } } }),
			"BAD_REQUEST",
		);
		// The same id twice.
		await expectCode(
			apply({ projects: { ZQV: { id: "DUP" }, ZQW: { id: "dup" } } }),
			"BAD_REQUEST",
		);
		// An id that belongs to a workspace's or project's space already.
		await admin.client.project.create({
			id: "ZQT",
			name: "Taken id",
			description: "",
			access: "public",
			icon: "AppWindowIcon",
			workspaceId: WORKSPACE,
		});
		await expectCode(
			apply({ projects: { ZQW: { id: "ZQT" } } }),
			"BAD_REQUEST",
		);
		// Nothing to import.
		await expectCode(
			apply({ projects: { ZQV: { include: false }, ZQW: { include: false } } }),
			"BAD_REQUEST",
		);
		// Unknown status target, and a link that isn't http(s).
		await expectCode(
			apply({ statuses: { "To Do": "nonsense" } }),
			"BAD_REQUEST",
		);
		await expectCode(
			apply({ jiraBaseUrl: "javascript:alert(1)" }),
			"BAD_REQUEST",
		);

		expect(await count("auth_space")).toBe(before + 1);
		expect(await count("project", "id IN ('ZQV', 'ZQW', 'DUP')")).toBe(0);
	});

	test("a free suggestion is offered when the key is taken or unusable", async () => {
		const plan = await admin.client.jiraImport.preview({
			workspaceId: WORKSPACE,
			csv: jiraCsv([
				{ summary: "a", key: "ZQT-1", projectName: "Clash" },
				{ summary: "b", key: "LONGKEY-1", projectName: "Long key" },
				{ summary: "c", key: "MY_KEY-1", projectName: "Underscore" },
			]),
		});
		const by = Object.fromEntries(plan.projects.map((p) => [p.jiraKey, p.id]));
		expect(by.ZQT).not.toBe("ZQT");
		expect(by.ZQT).toMatch(/^ZQT\d$|^ZQ\d\d$/);
		expect(by.LONGKEY).toMatch(/^[A-Z][A-Z0-9]{1,4}$/);
		expect(by.MY_KEY).toMatch(/^[A-Z][A-Z0-9]{1,4}$/);
		expect(plan.errors).toEqual([]);
	});

	test("exports that don't fit go in as plain items", async () => {
		const csv = jiraCsv([
			{
				summary: "Loop A",
				key: "ZQP-1",
				id: "1",
				parent: ["2", "ZQP-2"],
				projectName: "Odd",
			},
			{ summary: "Loop B", key: "ZQP-2", id: "2", parent: ["1", "ZQP-1"] },
			{ summary: "Self", key: "ZQP-3", id: "3", parent: ["3", "ZQP-3"] },
			{ summary: "Elsewhere", key: "ZQP-4", id: "4", parent: ["99", "ZQO-1"] },
			{ summary: "Duplicate row", key: "ZQP-4", id: "4" },
			{
				summary: "Other project",
				key: "ZQO-1",
				id: "99",
				projectName: "Other odd",
			},
			{ summary: "Bad date", key: "ZQP-5", created: "sometime last week" },
		]);
		const plan = await admin.client.jiraImport.preview({
			workspaceId: WORKSPACE,
			csv,
		});
		expect(plan.warnings.join("\n")).toContain("repeat an issue key");
		expect(plan.warnings.join("\n")).toContain("date(s) were in a format");

		await admin.client.jiraImport.apply({
			workspaceId: WORKSPACE,
			csv,
			mapping: {},
		});
		const parents = (await sql`
			SELECT id, parentId FROM issue WHERE projectId = 'ZQP' ORDER BY id
		`) as { id: string; parentId: string | null }[];
		// The loop is broken at one place, and nothing points outside the project.
		expect(
			parents.filter((p) => p.parentId !== null).length,
		).toBeLessThanOrEqual(1);
		expect(parents.find((p) => p.id === "ZQP-3")?.parentId).toBeNull();
		expect(parents.find((p) => p.id === "ZQP-4")?.parentId).toBeNull();
		expect(parents).toHaveLength(5);
	});
});

describe("jira import: awkward exports", () => {
	test("an item moved from another project can't collide with a native one", async () => {
		// ZQY-5 was moved into ZQZ and keeps its old key, so it is ZQZ's number 5 too.
		const csv = jiraCsv([
			{ summary: "Native", key: "ZQZ-5", projectName: "Moved into" },
			{
				summary: "Moved",
				key: "ZQY-5",
				projectKey: "ZQZ",
				projectName: "Moved into",
			},
		]);
		const plan = await admin.client.jiraImport.preview({
			workspaceId: WORKSPACE,
			csv,
		});
		expect(plan.totals.workItems).toBe(1);
		expect(plan.warnings.join("\n")).toContain("repeat an issue key");
		await admin.client.jiraImport.apply({
			workspaceId: WORKSPACE,
			csv,
			mapping: {},
		});
		expect(await count("issue", "projectId = 'ZQZ'")).toBe(1);
	});

	test("a long chain of sub-tasks is handled quickly", async () => {
		const rows: Row[] = Array.from({ length: 3000 }, (_, i) => ({
			summary: `Link ${i + 1}`,
			key: `ZQC-${i + 1}`,
			id: String(i + 1),
			projectName: "Chain",
			parent: i === 0 ? undefined : [String(i), `ZQC-${i}`],
		}));
		const started = performance.now();
		const plan = await admin.client.jiraImport.preview({
			workspaceId: WORKSPACE,
			csv: jiraCsv(rows),
		});
		expect(plan.totals.subItems).toBe(2999);
		expect(performance.now() - started).toBeLessThan(3000);
	});

	test("suggestions for unusable keys never take a usable key", async () => {
		const plan = await admin.client.jiraImport.preview({
			workspaceId: WORKSPACE,
			csv: jiraCsv([
				{ summary: "a", key: "ZQ_Q-1", projectName: "Underscore" },
				{ summary: "b", key: "ZQQ-1", projectName: "Plain" },
			]),
		});
		expect(plan.errors).toEqual([]);
		const by = Object.fromEntries(plan.projects.map((p) => [p.jiraKey, p.id]));
		expect(by.ZQQ).toBe("ZQQ");
		expect(by.ZQ_Q).not.toBe("ZQQ");
	});

	test("very long status names still import", async () => {
		const status = "S".repeat(400);
		const csv = jiraCsv([
			{ summary: "Long", key: "ZQS-1", projectName: "Statuses", status },
		]);
		const plan = await admin.client.jiraImport.preview({
			workspaceId: WORKSPACE,
			csv,
		});
		const name = plan.statuses[0]?.name as string;
		expect(name.length).toBe(255);
		await admin.client.jiraImport.apply({
			workspaceId: WORKSPACE,
			csv,
			mapping: { statuses: { [name]: "done" } },
		});
		expect(await count("issue", "projectId = 'ZQS'")).toBe(1);
	});
});

describe("jira import: all or nothing", () => {
	test("a failure on the second project leaves the first out too", async () => {
		const csv = jiraCsv([
			{ summary: "First", key: "ZQE-1", projectName: "Atomic one" },
			{ summary: "Second", key: "ZQF-1", projectName: "Atomic two" },
		]);
		const before = {
			issues: await count("issue"),
			spaces: await count("auth_space"),
			records: await count("import_record"),
		};
		// A conflict that only shows up while writing: the space exists by the time the
		// second project is inserted, though the plan was made before.
		await sql`CREATE TRIGGER jira_import_test_fail BEFORE INSERT ON project
			WHEN NEW.id = 'ZQF' BEGIN SELECT RAISE(ABORT, 'boom'); END`;
		try {
			await expect(
				admin.client.jiraImport.apply({
					workspaceId: WORKSPACE,
					csv,
					mapping: {},
				}),
			).rejects.toBeDefined();
		} finally {
			await sql`DROP TRIGGER jira_import_test_fail`;
		}
		expect({
			issues: await count("issue"),
			spaces: await count("auth_space"),
			records: await count("import_record"),
		}).toEqual(before);
		expect(await count("project", "id IN ('ZQE', 'ZQF')")).toBe(0);

		// And it works once the problem is gone.
		await admin.client.jiraImport.apply({
			workspaceId: WORKSPACE,
			csv,
			mapping: {},
		});
		expect(await count("project", "id IN ('ZQE', 'ZQF')")).toBe(2);
	});

	test("a project id taken by someone else in between is a conflict, not a half import", async () => {
		// The id looks free to the plan but the unique constraint has the last word.
		await sql`CREATE TRIGGER jira_import_test_clash BEFORE INSERT ON project
			WHEN NEW.id = 'ZQH' BEGIN
				INSERT INTO auth_space (id, name, ownerId, createdAt, updatedAt)
				VALUES ('ZQH', 'x', NEW.createdBy, 0, 0);
			END`;
		const csv = jiraCsv([
			{ summary: "Race", key: "ZQH-1", projectName: "Race" },
		]);
		try {
			await expectCode(
				admin.client.jiraImport.apply({
					workspaceId: WORKSPACE,
					csv,
					mapping: {},
				}),
				"CONFLICT",
			);
		} finally {
			await sql`DROP TRIGGER jira_import_test_clash`;
		}
		expect(await count("auth_space", "id = 'ZQH'")).toBe(0);
		expect(await count("issue", "projectId = 'ZQH'")).toBe(0);
	});
});
