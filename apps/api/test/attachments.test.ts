import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { createRouterClient } from "@orpc/server";

// Imported dynamically so setup.ts points the database at a temp file first.
await import("./setup");
const { Auth } = await import("@smelp/auth");
const { DB } = await import("@smelp/db");
const { router } = await import("../src/router");
const { attachmentResponse, attachmentsPath, cleanFileName, uploadAttachment } =
	await import("../src/lib/attachments");

const sql = new DB().sqlite;
const auth = new Auth();

const WORKSPACE = "attachment_tests";
const PROJECT = "ATT";

function first<T>(items: T[]): T {
	const [item] = items;
	if (item === undefined) throw new Error("Expected at least one item");
	return item;
}

let userCount = 0;
async function createUser(name: string) {
	userCount += 1;
	const { session, user } = await auth.signUp(
		`at-${name}-${userCount}@example.test`,
		name,
		`at-${name}-${userCount}`,
		"correct-horse-battery",
	);
	const headers = new Headers({
		cookie: `auth_session=${session.authSessionToken}`,
	});
	return {
		id: user.id,
		headers,
		client: createRouterClient(router, {
			context: { headers, ip: "198.51.100.11" },
		}),
	};
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

function upload(
	user: User | null,
	file: File,
	params: { issueId: string; commentId?: string },
) {
	const query = new URLSearchParams(params);
	const body = new FormData();
	body.set("file", file);
	return uploadAttachment(
		new Request(`http://localhost/api/attachments?${query}`, {
			method: "POST",
			headers: user?.headers,
			body,
		}),
	);
}

const download = (user: User | null, id: string) =>
	attachmentResponse(user?.headers ?? new Headers(), id);

async function keyOf(id: string) {
	const rows =
		(await sql`SELECT storageKey FROM attachment WHERE id = ${id}`) as {
			storageKey: string;
		}[];
	return first(rows).storageKey;
}

type Saved = {
	id: string;
	name: string;
	size: number;
	uploaderId: string;
	commentId: string | null;
};
const readSaved = async (response: Response) =>
	(await response.json()) as Saved;

const text = (content: string, name = "notes.txt", type = "text/plain") =>
	new File([content], name, { type });

let admin: User;
let member: User;
let otherMember: User;
let guest: User;
let outsider: User;
let issueId: string;
let commentId: string;

const issueInput = (title: string, stateId: string) => ({
	title,
	description: "",
	state: stateId,
	type: "task",
	workspaceId: WORKSPACE,
	projectId: PROJECT,
});
let stateId: string;
const newIssue = (title = "With files") =>
	member.client.issue.create(issueInput(title, stateId));

async function attach(
	user: User,
	content = "hello",
	params: { commentId?: string } = {},
) {
	const response = await upload(user, text(content), { issueId, ...params });
	expect(response.status).toBe(201);
	const saved = await readSaved(response);
	return { ...saved, storageKey: await keyOf(saved.id) };
}

beforeAll(async () => {
	admin = await createUser("admin");
	member = await createUser("member");
	otherMember = await createUser("other");
	guest = await createUser("guest");
	outsider = await createUser("outsider");

	await admin.client.workspace.create({ name: "Attachment tests" });
	await admin.client.project.create({
		id: PROJECT,
		name: "Attachments",
		description: "",
		access: "private",
		icon: "AppWindowIcon",
		workspaceId: WORKSPACE,
	});
	for (const user of [member, otherMember, guest]) {
		await addMember(WORKSPACE, user.id, "member");
	}
	await addMember(PROJECT, member.id, "member");
	await addMember(PROJECT, otherMember.id, "member");
	await addMember(PROJECT, guest.id, "guest");

	stateId = first(await admin.client.states.find({ projectId: PROJECT })).id;
	issueId = (await newIssue()).id;
	commentId = (
		await member.client.comments.create({ issueId, body: "Has a file" })
	).id;
});

describe("uploading", () => {
	test("stores the file under a generated name and records its metadata", async () => {
		const response = await upload(
			member,
			text("some notes", "../../evil.txt"),
			{
				issueId,
			},
		);
		expect(response.status).toBe(201);
		const saved = await readSaved(response);

		expect(saved.name).toBe("evil.txt");
		expect(saved.size).toBe(10);
		expect(saved.uploaderId).toBe(member.id);
		expect(saved.commentId).toBeNull();
		expect(saved).not.toHaveProperty("storageKey");
		const storageKey = await keyOf(saved.id);
		expect(storageKey).toMatch(/^[0-9a-f-]{36}$/);
		const onDisk = path.join(attachmentsPath(), storageKey);
		expect(await Bun.file(onDisk).text()).toBe("some notes");
		expect(readdirSync(attachmentsPath())).not.toContain("evil.txt");
	});

	test("can be attached to a comment by its author only", async () => {
		const response = await upload(member, text("on a comment"), {
			issueId,
			commentId,
		});
		expect(response.status).toBe(201);
		expect((await readSaved(response)).commentId).toBe(commentId);

		const refused = await upload(otherMember, text("not mine"), {
			issueId,
			commentId,
		});
		expect(refused.status).toBe(403);
	});

	test("refuses a comment from another work item", async () => {
		const other = await newIssue("Another");
		const response = await upload(member, text("x"), {
			issueId: other.id,
			commentId,
		});
		expect(response.status).toBe(404);
	});

	test("refuses a file over the limit and keeps nothing", async () => {
		const before = readdirSync(attachmentsPath()).length;
		process.env.MAX_ATTACHMENT_MB = "0.001";
		try {
			const response = await upload(member, text("x".repeat(2000)), {
				issueId,
			});
			expect(response.status).toBe(413);
			expect(await response.text()).toContain("too large");
			// Just under the limit still goes through.
			expect(
				(await upload(member, text("x".repeat(1000)), { issueId })).status,
			).toBe(201);
		} finally {
			delete process.env.MAX_ATTACHMENT_MB;
		}
		expect(readdirSync(attachmentsPath()).length).toBe(before + 1);
	});

	test("refuses by Content-Length before reading the body", async () => {
		const request = new Request(
			`http://localhost/api/attachments?issueId=${issueId}`,
			{
				method: "POST",
				headers: member.headers,
				body: "x",
			},
		);
		request.headers.set("content-length", String(1024 * 1024 * 1024));
		expect((await uploadAttachment(request)).status).toBe(413);
	});

	test("needs a session, write access, and a project that isn't archived", async () => {
		expect((await upload(null, text("x"), { issueId })).status).toBe(401);
		expect((await upload(guest, text("x"), { issueId })).status).toBe(403);
		expect((await upload(outsider, text("x"), { issueId })).status).toBe(403);
		expect(
			(await upload(member, text("x"), { issueId: "NOPE-1" })).status,
		).toBe(404);

		await admin.client.project.archive({ projectId: PROJECT });
		try {
			const response = await upload(member, text("x"), { issueId });
			expect(response.status).toBe(403);
			expect(await response.text()).toBe("This project is archived");
		} finally {
			await admin.client.project.unarchive({ projectId: PROJECT });
		}
	});

	test("shows up in the work item's activity", async () => {
		await attach(member, "logged");
		await Bun.sleep(50);
		const activity = await member.client.activity.findForIssue({ issueId });
		expect(activity.map((entry) => entry.action)).toContain(
			"issue.attachment_added",
		);
	});
});

describe("listing and downloading", () => {
	test("anyone who can read the work item sees the list, without storage keys", async () => {
		const saved = await attach(member, "list me");
		for (const user of [member, guest]) {
			const list = await user.client.attachments.find({ issueId });
			const found = list.find((item) => item.id === saved.id);
			expect(found?.name).toBe("notes.txt");
			expect(found?.uploaderName).toMatch(/member/);
			expect(found).not.toHaveProperty("storageKey");
		}
		await expect(
			outsider.client.attachments.find({ issueId }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	test("serves files as downloads that can't be sniffed", async () => {
		const saved = await attach(member, "<script>alert(1)</script>");
		const response = await download(guest, saved.id);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("<script>alert(1)</script>");
		expect(response.headers.get("content-disposition")).toStartWith(
			'attachment; filename="notes.txt"',
		);
		expect(response.headers.get("x-content-type-options")).toBe("nosniff");
		expect(response.headers.get("content-type")).toBe(
			"application/octet-stream",
		);
	});

	test("never serves HTML or SVG as something a browser would open", async () => {
		const html = await upload(
			member,
			text("<h1>hi</h1>", "page.html", "text/html"),
			{ issueId },
		);
		const svg = await upload(
			member,
			text("<svg/>", "image.svg", "image/svg+xml"),
			{ issueId },
		);
		for (const response of [html, svg]) {
			const saved = await readSaved(response);
			const served = await download(member, saved.id);
			expect(served.headers.get("content-disposition")).toStartWith(
				"attachment",
			);
			expect(served.headers.get("content-type")).toBe(
				"application/octet-stream",
			);
		}
	});

	test("shows an image inline only when its bytes are an image", async () => {
		const png = new Uint8Array([
			0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4,
		]);
		const real = await readSaved(
			await upload(member, new File([png], "pic.png", { type: "image/png" }), {
				issueId,
			}),
		);
		const served = await download(member, real.id);
		expect(served.headers.get("content-type")).toBe("image/png");
		expect(served.headers.get("content-disposition")).toStartWith("inline");

		const fake = await readSaved(
			await upload(member, text("not a png", "fake.png", "image/png"), {
				issueId,
			}),
		);
		const refused = await download(member, fake.id);
		expect(refused.headers.get("content-type")).toBe(
			"application/octet-stream",
		);
		expect(refused.headers.get("content-disposition")).toStartWith(
			"attachment",
		);
	});

	test("is refused to people who can't read the work item", async () => {
		const saved = await attach(member);
		expect((await download(null, saved.id)).status).toBe(401);
		expect((await download(outsider, saved.id)).status).toBe(403);
		expect((await download(member, "missing")).status).toBe(404);
	});
});

describe("deleting", () => {
	test("the uploader or an admin can delete, and the file goes too", async () => {
		const mine = await attach(member);
		const theirs = await attach(member);
		await member.client.attachments.delete({ id: mine.id });
		await admin.client.attachments.delete({ id: theirs.id });
		for (const saved of [mine, theirs]) {
			expect(existsSync(path.join(attachmentsPath(), saved.storageKey))).toBe(
				false,
			);
			expect((await download(member, saved.id)).status).toBe(404);
		}
	});

	test("other members, guests and outsiders can't", async () => {
		const saved = await attach(member);
		for (const user of [otherMember, guest, outsider]) {
			await expect(
				user.client.attachments.delete({ id: saved.id }),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
		}
		expect((await download(member, saved.id)).status).toBe(200);
	});

	test("an archived project keeps its files", async () => {
		const saved = await attach(member);
		await admin.client.project.archive({ projectId: PROJECT });
		try {
			await expect(
				member.client.attachments.delete({ id: saved.id }),
			).rejects.toMatchObject({
				code: "FORBIDDEN",
				message: "This project is archived",
			});
		} finally {
			await admin.client.project.unarchive({ projectId: PROJECT });
		}
		expect((await download(member, saved.id)).status).toBe(200);
	});

	test("deleting a comment removes its files", async () => {
		const comment = await member.client.comments.create({
			issueId,
			body: "Will go",
		});
		const saved = await attach(member, "bye", { commentId: comment.id });
		await member.client.comments.delete({ id: comment.id });

		expect(existsSync(path.join(attachmentsPath(), saved.storageKey))).toBe(
			false,
		);
		const rows = await sql`SELECT id FROM attachment WHERE id = ${saved.id}`;
		expect(rows.length).toBe(0);
	});

	test("deleting a work item removes the files on it and on its comments", async () => {
		const issue = await newIssue("Doomed");
		const comment = await member.client.comments.create({
			issueId: issue.id,
			body: "Doomed too",
		});
		const keys: string[] = [];
		for (const params of [{}, { commentId: comment.id }]) {
			const response = await upload(member, text("x"), {
				issueId: issue.id,
				...params,
			});
			keys.push(await keyOf((await readSaved(response)).id));
		}

		await member.client.issue.delete({ id: issue.id });

		for (const key of keys) {
			expect(existsSync(path.join(attachmentsPath(), key))).toBe(false);
		}
		const rows =
			await sql`SELECT id FROM attachment WHERE issueId = ${issue.id}`;
		expect(rows.length).toBe(0);
	});

	test("deleting a project removes its files", async () => {
		await admin.client.project.create({
			id: "GONE",
			name: "Gone",
			description: "",
			access: "private",
			icon: "AppWindowIcon",
			workspaceId: WORKSPACE,
		});
		const goneState = first(
			await admin.client.states.find({ projectId: "GONE" }),
		);
		const issue = await admin.client.issue.create({
			...issueInput("In a doomed project", goneState.id),
			projectId: "GONE",
		});
		const response = await upload(admin, text("x"), { issueId: issue.id });
		const key = await keyOf((await readSaved(response)).id);

		await admin.client.project.delete({ projectId: "GONE" });

		expect(existsSync(path.join(attachmentsPath(), key))).toBe(false);
	});
});

describe("file names", () => {
	test("drop paths, control characters and leading dots", () => {
		expect(cleanFileName("../../etc/passwd")).toBe("passwd");
		expect(cleanFileName("C:\\Users\\me\\report.pdf")).toBe("report.pdf");
		expect(cleanFileName("a\u0000b\nc.txt")).toBe("abc.txt");
		expect(cleanFileName("..hidden")).toBe("hidden");
		expect(cleanFileName("   ")).toBe("file");
		expect(cleanFileName("x".repeat(500)).length).toBe(200);
	});
});
