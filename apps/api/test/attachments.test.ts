import { beforeAll, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	statSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { createRouterClient } from "@orpc/server";

// Imported dynamically so setup.ts points the database at a temp file first.
await import("./setup");
const { Auth } = await import("@smelp/auth");
const { DB } = await import("@smelp/db");
const { router } = await import("../src/router");
const {
	attachmentResponse,
	attachmentsPath,
	cleanFileName,
	sweepAttachments,
	uploadAttachment,
} = await import("../src/lib/attachments");

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

// Sends what a browser would: a multipart body with its size, and the header the web
// app adds.
async function upload(
	user: User | null,
	file: File,
	params: { issueId: string; commentId?: string },
	extra: Record<string, string> = { "x-smelp-upload": "1" },
) {
	const query = new URLSearchParams(params);
	// Built by hand, because the content type of a FormData body is only known once
	// it's sent.
	const boundary = "----smelp-test-boundary";
	const body = new Blob([
		`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type || "application/octet-stream"}\r\n\r\n`,
		file,
		`\r\n--${boundary}--\r\n`,
	]);
	const bytes = await body.arrayBuffer();
	const headers = new Headers(user?.headers);
	headers.set("content-type", `multipart/form-data; boundary=${boundary}`);
	headers.set("content-length", String(bytes.byteLength));
	for (const [name, value] of Object.entries(extra)) headers.set(name, value);
	return uploadAttachment(
		new Request(`http://localhost/api/attachments?${query}`, {
			method: "POST",
			headers,
			body: bytes,
		}),
	);
}

// A body that arrives in pieces, so nothing can know its size up front.
function streamOf(pieces: number, pieceBytes: number) {
	let sent = 0;
	return new ReadableStream<Uint8Array>({
		pull(controller) {
			if (sent >= pieces) return controller.close();
			sent += 1;
			controller.enqueue(new Uint8Array(pieceBytes).fill(97));
		},
	});
}

const streamingRequest = (
	headers: Record<string, string>,
	body: ReadableStream,
) =>
	new Request(`http://localhost/api/attachments?issueId=${issueId}`, {
		method: "POST",
		headers: {
			cookie: member.headers.get("cookie") ?? "",
			"x-smelp-upload": "1",
			"content-type": "multipart/form-data; boundary=x",
			...headers,
		},
		body,
		duplex: "half",
	});

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

	test.skipIf(process.platform === "win32")(
		"files are readable only by the server's user",
		async () => {
			const saved = await attach(member, "private");
			const mode = statSync(
				path.join(attachmentsPath(), await keyOf(saved.id)),
			).mode;
			expect(mode & 0o777).toBe(0o600);
		},
	);

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
		const request = streamingRequest(
			{ "content-length": String(1024 * 1024 * 1024) },
			streamOf(1, 1),
		);
		expect((await uploadAttachment(request)).status).toBe(413);
	});

	test("refuses a body that doesn't say its size, instead of buffering it", async () => {
		process.env.MAX_ATTACHMENT_MB = "0.001";
		try {
			const response = await uploadAttachment(
				streamingRequest({}, streamOf(80, 64 * 1024)),
			);
			expect(response.status).toBe(411);
		} finally {
			delete process.env.MAX_ATTACHMENT_MB;
		}
	});

	test("cuts off a body that is bigger than it claims", async () => {
		process.env.MAX_ATTACHMENT_MB = "0.001";
		const before = readdirSync(attachmentsPath()).length;
		try {
			const response = await uploadAttachment(
				streamingRequest({ "content-length": "100" }, streamOf(80, 64 * 1024)),
			);
			expect(response.status).toBe(413);
		} finally {
			delete process.env.MAX_ATTACHMENT_MB;
		}
		expect(readdirSync(attachmentsPath()).length).toBe(before);
	});

	test("must carry the header only the web app sends", async () => {
		const without = await upload(member, text("x"), { issueId }, {});
		expect(without.status).toBe(403);
		const crossSite = await upload(
			member,
			text("x"),
			{ issueId },
			{ "x-smelp-upload": "1", "sec-fetch-site": "cross-site" },
		);
		expect(crossSite.status).toBe(403);
		const sameSite = await upload(
			member,
			text("x"),
			{ issueId },
			{ "x-smelp-upload": "1", "sec-fetch-site": "same-origin" },
		);
		expect(sameSite.status).toBe(201);
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

	test("names with quotes, other scripts and control characters stay safe in the header", async () => {
		const saved = await attach(member);
		// As stored, since a form upload would escape the quote on its way in.
		const nasty = `a"b'(c)*é日本d.txt`;
		await sql`UPDATE attachment SET name = ${nasty} WHERE id = ${saved.id}`;
		const served = await download(member, saved.id);
		const disposition = served.headers.get("content-disposition") ?? "";
		expect(disposition).toContain(`filename="a_b'(c)*___d.txt"`);
		expect(disposition).toContain(
			"filename*=UTF-8''a%22b%27%28c%29%2A%C3%A9%E6%97%A5%E6%9C%ACd.txt",
		);
		expect(disposition).not.toMatch(/[\u0080-\u202e]/);
	});

	test("only GET and HEAD are served", async () => {
		const saved = await attach(member);
		const response = await attachmentResponse(member.headers, saved.id, "POST");
		expect(response.status).toBe(405);
		expect(
			(await attachmentResponse(member.headers, saved.id, "HEAD")).status,
		).toBe(200);
	});

	test("tells the web app the size limit", async () => {
		expect(await member.client.attachments.limits()).toEqual({
			maxBytes: 25 * 1024 * 1024,
		});
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
			id: "ATGON",
			name: "Attachments gone",
			description: "",
			access: "private",
			icon: "AppWindowIcon",
			workspaceId: WORKSPACE,
		});
		const goneState = first(
			await admin.client.states.find({ projectId: "ATGON" }),
		);
		const issue = await admin.client.issue.create({
			...issueInput("In a doomed project", goneState.id),
			projectId: "ATGON",
		});
		const response = await upload(admin, text("x"), { issueId: issue.id });
		const key = await keyOf((await readSaved(response)).id);

		await admin.client.project.delete({ projectId: "ATGON" });

		expect(existsSync(path.join(attachmentsPath(), key))).toBe(false);
	});
});

describe("file names", () => {
	test("drop paths, control characters and leading dots", () => {
		expect(cleanFileName("../../etc/passwd")).toBe("passwd");
		expect(cleanFileName("C:\\Users\\me\\report.pdf")).toBe("report.pdf");
		expect(cleanFileName("a\u0000b\nc.txt")).toBe("abc.txt");
		expect(cleanFileName("..hidden")).toBe("hidden");
		expect(cleanFileName("a\u0085b\u202ec\u2066d\u200fe.txt")).toBe(
			"abcde.txt",
		);
		expect(cleanFileName("   ")).toBe("file");
		expect(cleanFileName("x".repeat(500)).length).toBe(200);
	});
});

describe("cleaning up", () => {
	const HOUR = 60 * 60 * 1000;

	async function leftover(content: string, age: number, row = false) {
		const key = crypto.randomUUID();
		const file = path.join(attachmentsPath(), key);
		mkdirSync(attachmentsPath(), { recursive: true });
		writeFileSync(file, content);
		const when = new Date(Date.now() - age);
		utimesSync(file, when, when);
		if (row) {
			await sql`INSERT INTO attachment ${sql({
				id: crypto.randomUUID(),
				issueId,
				commentId: null,
				uploaderId: member.id,
				name: "old.txt",
				size: content.length,
				contentType: "text/plain",
				storageKey: key,
				createdAt: Date.now() - age,
			})}`;
		}
		return file;
	}

	test("removes old files nothing refers to, and keeps the rest", async () => {
		const orphan = await leftover("orphan", 2 * HOUR);
		const recent = await leftover("recent", 60_000);
		const used = await leftover("used", 2 * HOUR, true);
		const stray = path.join(attachmentsPath(), "notes.txt");
		writeFileSync(stray, "not ours");
		const old = new Date(Date.now() - 2 * HOUR);
		utimesSync(stray, old, old);

		expect(await sweepAttachments()).toBe(1);

		expect(existsSync(orphan)).toBe(false);
		expect(existsSync(recent)).toBe(true);
		expect(existsSync(used)).toBe(true);
		expect(existsSync(stray)).toBe(true);
	});

	test("leaves files that a restore set aside", async () => {
		const aside = path.join(attachmentsPath(), ".before-restore-test");
		mkdirSync(aside, { recursive: true });
		const kept = path.join(aside, crypto.randomUUID());
		writeFileSync(kept, "kept by restore");
		const old = new Date(Date.now() - 3 * HOUR);
		utimesSync(kept, old, old);
		utimesSync(aside, old, old);

		await sweepAttachments();

		expect(existsSync(kept)).toBe(true);
	});

	test("does nothing when there is no folder", async () => {
		const saved = process.env.ATTACHMENTS_PATH;
		process.env.ATTACHMENTS_PATH = path.join(
			attachmentsPath(),
			"missing-folder",
		);
		try {
			expect(await sweepAttachments()).toBe(0);
		} finally {
			if (saved === undefined) delete process.env.ATTACHMENTS_PATH;
			else process.env.ATTACHMENTS_PATH = saved;
		}
	});
});
