import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import { createRouterClient } from "@orpc/server";

// Imported dynamically so setup.ts points the database at a temp file first.
await import("./setup");
const { Auth } = await import("@smelp/auth");
const { DB } = await import("@smelp/db");
const { router } = await import("../src/router");
const { attachmentResponse, uploadAttachment } = await import(
	"../src/lib/attachments"
);
const { avatarResponse } = await import("../src/lib/avatars");
const { projectBackgroundResponse } = await import(
	"../src/lib/project-backgrounds"
);

const sql = new DB().sqlite;
const auth = new Auth();

const EMAIL_DOMAIN = "public-access.example.test";
const OPEN_PROJECT = "OPN";
const SECRET_PROJECT = "SEC";
const SECRET_TITLE = "Rotate the vault keys";

function clientWith(headers: Headers) {
	return createRouterClient(router, {
		context: { headers, ip: "198.51.100.77" },
	});
}
type Client = ReturnType<typeof clientWith>;

const cookie = (token: string) =>
	new Headers({ cookie: `auth_session=${token}` });

let userCount = 0;
async function createUser(name: string) {
	userCount += 1;
	const displayName = `pa-${name}-${userCount}`;
	const { session, user } = await auth.signUp(
		`${displayName}@${EMAIL_DOMAIN}`,
		name,
		displayName,
		"correct-horse-battery",
	);
	const headers = cookie(session.authSessionToken);
	return {
		id: user.id,
		displayName,
		sessionId: session.authSession.id,
		headers,
		client: clientWith(headers),
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

function first<T>(items: T[]): T {
	const [item] = items;
	if (item === undefined) throw new Error("Expected at least one item");
	return item;
}

const expectCode = (call: Promise<unknown>, code: string) =>
	expect(call).rejects.toMatchObject({ code });

const png = Buffer.from([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 0, 255,
]);
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

async function upload(user: User, file: File, issueId: string) {
	const boundary = "----smelp-test-boundary";
	const body = new Blob([
		`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`,
		file,
		`\r\n--${boundary}--\r\n`,
	]);
	const bytes = await body.arrayBuffer();
	const headers = new Headers(user.headers);
	headers.set("content-type", `multipart/form-data; boundary=${boundary}`);
	headers.set("content-length", String(bytes.byteLength));
	headers.set("x-smelp-upload", "1");
	const response = await uploadAttachment(
		new Request(`http://localhost/api/attachments?issueId=${issueId}`, {
			method: "POST",
			headers,
			body: bytes,
		}),
	);
	expect(response.status).toBe(201);
	return (await response.json()) as { id: string };
}

const noHeaders = new Headers();
const visitor = clientWith(noHeaders);

let workspaceId: string;
let owner: User;
let member: User;
let colleague: User;
let outsider: User;
let instanceAdmin: User;

let stateId: string;
let issueId: string;
let relatedIssueId: string;
let secretIssueId: string;
let commentId: string;
let cycleId: string;
let moduleId: string;
let attachmentId: string;

type Switch = "instance" | "workspace" | "project";
const SWITCHES: Switch[] = ["instance", "workspace", "project"];

// Each switch is flipped the way its admin would, through the API.
async function open(switches: Record<Switch, boolean>) {
	await instanceAdmin.client.instance.update({
		publicAccess: switches.instance,
	});
	await owner.client.workspace.update({
		workspaceId,
		public: switches.workspace,
	});
	await owner.client.project.update({
		projectId: OPEN_PROJECT,
		access: switches.project ? "public" : "private",
	});
}
const everythingOpen = { instance: true, workspace: true, project: true };

type Read = [name: string, call: (client: Client) => Promise<unknown>];

const workspaceReads: Read[] = [
	["workspace.find", (c) => c.workspace.find({ workspaceId })],
	["projects.find", (c) => c.projects.find({ workspaceId })],
];

const projectReads: Read[] = [
	["project.find", (c) => c.project.find({ projectId: OPEN_PROJECT })],
	["states.find", (c) => c.states.find({ projectId: OPEN_PROJECT })],
	["issues.find", (c) => c.issues.find({ projectId: OPEN_PROJECT })],
	["issue.find", (c) => c.issue.find({ issueId })],
	["comments.find", (c) => c.comments.find({ issueId })],
	["links.find", (c) => c.links.find({ issueId })],
	["issueRelations.find", (c) => c.issueRelations.find({ issueId })],
	["attachments.find", (c) => c.attachments.find({ issueId })],
	["cycles.find", (c) => c.cycles.find({ projectId: OPEN_PROJECT })],
	["cycles.findOne", (c) => c.cycles.findOne({ id: cycleId })],
	["modules.find", (c) => c.modules.find({ projectId: OPEN_PROJECT })],
	["modules.get", (c) => c.modules.get({ id: moduleId })],
	[
		"projectMembers.find",
		(c) => c.projectMembers.find({ projectId: OPEN_PROJECT }),
	],
];

const membersOnlyReads: Read[] = [
	["activity.findForIssue", (c) => c.activity.findForIssue({ issueId })],
	["activity.findWorkspace", (c) => c.activity.findWorkspace({ workspaceId })],
	["issues.search", (c) => c.issues.search({ workspaceId, query: "board" })],
	[
		"issues.findByIds",
		(c) => c.issues.findByIds({ workspaceId, ids: [issueId] }),
	],
	["issues.findMine", (c) => c.issues.findMine({ workspaceId })],
	["workspaceMembers.find", (c) => c.workspaceMembers.find({ workspaceId })],
	["workspaceInvites.find", (c) => c.workspaceInvites.find({ workspaceId })],
	[
		"projectMembers.findAvailable",
		(c) => c.projectMembers.findAvailable({ projectId: OPEN_PROJECT }),
	],
];

const writes: Read[] = [
	[
		"issue.create",
		(c) =>
			c.issue.create({
				title: "From outside",
				description: "",
				state: stateId,
				workspaceId,
				projectId: OPEN_PROJECT,
			}),
	],
	["issue.update", (c) => c.issue.update({ id: issueId, title: "Defaced" })],
	["issue.delete", (c) => c.issue.delete({ id: issueId })],
	["comments.create", (c) => c.comments.create({ issueId, body: "Hello" })],
	[
		"comments.setReaction",
		(c) => c.comments.setReaction({ commentId, emoji: "🎉", reacted: true }),
	],
	[
		"links.create",
		(c) => c.links.create({ issueId, url: "https://example.test/spam" }),
	],
	[
		"issueRelations.add",
		(c) =>
			c.issueRelations.add({
				issueId,
				relatedId: secretIssueId,
				kind: "blocks",
			}),
	],
	[
		"project.update",
		(c) => c.project.update({ projectId: OPEN_PROJECT, name: "Defaced" }),
	],
	["project.join", (c) => c.project.join({ projectId: OPEN_PROJECT })],
	[
		"state.create",
		(c) =>
			c.state.create({
				projectId: OPEN_PROJECT,
				name: "Spam",
				color: "#ffffff",
				group: "backlog",
			}),
	],
	[
		"cycles.create",
		(c) =>
			c.cycles.create({
				projectId: OPEN_PROJECT,
				name: "Spam",
				startDate: "2031-01-01",
				endDate: "2031-01-07",
			}),
	],
	[
		"modules.create",
		(c) => c.modules.create({ projectId: OPEN_PROJECT, name: "Spam" }),
	],
	[
		"workspace.update",
		(c) => c.workspace.update({ workspaceId, name: "Mine" }),
	],
];

beforeAll(async () => {
	owner = await createUser("owner");
	member = await createUser("member");
	colleague = await createUser("colleague");
	outsider = await createUser("outsider");
	instanceAdmin = await createUser("admin");
	await sql`UPDATE auth_user SET role = 'admin' WHERE id = ${instanceAdmin.id}`;

	workspaceId = (await owner.client.workspace.create({ name: "Open Books" }))
		.id;
	await addMember(workspaceId, member.id, "member");
	await addMember(workspaceId, colleague.id, "member");

	for (const [id, access] of [
		[OPEN_PROJECT, "public"],
		[SECRET_PROJECT, "private"],
	] as const) {
		await owner.client.project.create({
			id,
			name: `Project ${id}`,
			description: "",
			access,
			icon: "AppWindowIcon",
			workspaceId,
		});
	}
	await addMember(OPEN_PROJECT, member.id, "member");

	stateId = first(
		await owner.client.states.find({ projectId: OPEN_PROJECT }),
	).id;
	const secretStateId = first(
		await owner.client.states.find({ projectId: SECRET_PROJECT }),
	).id;
	const newIssue = (projectId: string, state: string, title: string) =>
		owner.client.issue.create({
			title,
			description: "",
			state,
			workspaceId,
			projectId,
		});
	issueId = (await newIssue(OPEN_PROJECT, stateId, "Ship the public board")).id;
	relatedIssueId = (await newIssue(OPEN_PROJECT, stateId, "Write the docs")).id;
	secretIssueId = (await newIssue(SECRET_PROJECT, secretStateId, SECRET_TITLE))
		.id;
	await owner.client.issue.update({ id: issueId, assignee: member.id });

	commentId = (
		await owner.client.comments.create({ issueId, body: "Looks good to me" })
	).id;
	await member.client.comments.setReaction({
		commentId,
		emoji: "👍",
		reacted: true,
	});
	await owner.client.links.create({
		issueId,
		url: "https://example.test/spec",
		title: "Spec",
	});
	for (const relatedId of [relatedIssueId, secretIssueId]) {
		await owner.client.issueRelations.add({
			issueId,
			relatedId,
			kind: "blocks",
		});
	}
	const cycle = await owner.client.cycles.create({
		projectId: OPEN_PROJECT,
		name: "Sprint 1",
		startDate: "2030-01-01",
		endDate: "2030-01-14",
	});
	cycleId = cycle.id;
	const module = await owner.client.modules.create({
		projectId: OPEN_PROJECT,
		name: "Launch",
		leadId: member.id,
	});
	moduleId = module?.id ?? "";
	attachmentId = (
		await upload(
			owner,
			new File(["the plan"], "plan.txt", { type: "text/plain" }),
			issueId,
		)
	).id;
	await owner.client.project.setBackground({
		projectId: OPEN_PROJECT,
		image: b64(png),
	});
	for (const user of [member, outsider]) {
		await user.client.auth.setAvatar({ image: b64(png) });
	}
});

beforeEach(() => open(everythingOpen));

// Other test files share this database and expect a closed instance.
afterAll(() => open({ instance: false, workspace: false, project: true }));

describe("a visitor without an account", () => {
	test.each([...workspaceReads, ...projectReads])(
		"can call %s on a public project",
		async (_name, call) => {
			await call(visitor);
		},
	);

	test("sees the board's content", async () => {
		const issues = await visitor.issues.find({ projectId: OPEN_PROJECT });
		expect(issues.map((issue) => issue.title).sort()).toEqual([
			"Ship the public board",
			"Write the docs",
		]);

		const states = await visitor.states.find({ projectId: OPEN_PROJECT });
		expect(states.map((state) => state.name)).toEqual([
			"Backlog",
			"Todo",
			"In Progress",
			"Done",
		]);

		const issue = await visitor.issue.find({ issueId });
		expect(issue).toMatchObject({
			title: "Ship the public board",
			assignee: member.id,
			createdByName: owner.displayName,
		});

		const workspace = await visitor.workspace.find({ workspaceId });
		expect(workspace).toMatchObject({
			name: "Open Books",
			public: 1,
			viewerAccess: "public",
		});
	});

	test("sees comments and who reacted, without having reacted", async () => {
		expect(await visitor.comments.find({ issueId })).toMatchObject([
			{
				body: "Looks good to me",
				authorName: owner.displayName,
				reactions: [
					{
						emoji: "👍",
						count: 1,
						reacted: false,
						users: [member.displayName],
					},
				],
			},
		]);
	});

	test("sees who is on the project, to show names and pictures", async () => {
		const members = await visitor.projectMembers.find({
			projectId: OPEN_PROJECT,
		});
		expect(
			members.map((person) => ({
				userId: person.userId,
				displayName: person.displayName,
			})),
		).toEqual(
			expect.arrayContaining([
				{ userId: owner.id, displayName: owner.displayName },
				{ userId: member.id, displayName: member.displayName },
			]),
		);
		expect(members).toHaveLength(2);
	});

	test("never receives an email address", async () => {
		for (const [name, call] of [...workspaceReads, ...projectReads]) {
			const body = JSON.stringify(await call(visitor));
			expect(body, name).not.toContain(EMAIL_DOMAIN);
			expect(body, name).not.toContain('"email"');
		}
		expect(
			JSON.stringify(await visitor.instance.publicWorkspaces()),
		).not.toContain(EMAIL_DOMAIN);

		// The same call does carry addresses for a member, so the check above can fail.
		expect(
			JSON.stringify(
				await member.client.projectMembers.find({ projectId: OPEN_PROJECT }),
			),
		).toContain(EMAIL_DOMAIN);
	});

	test.each(writes)("can't call %s", async (_name, call) => {
		await expectCode(call(visitor), "UNAUTHORIZED");
	});

	test("leaves nothing behind after trying to write", async () => {
		for (const [, call] of writes) await call(visitor).catch(() => {});

		expect(await owner.client.comments.find({ issueId })).toHaveLength(1);
		expect(
			await owner.client.issues.find({ projectId: OPEN_PROJECT }),
		).toHaveLength(2);
		expect(
			(await owner.client.project.find({ projectId: OPEN_PROJECT })).name,
		).toBe(`Project ${OPEN_PROJECT}`);
	});

	test.each(membersOnlyReads)("can't call %s", async (_name, call) => {
		await expectCode(call(visitor), "UNAUTHORIZED");
	});

	test("has no notifications, workspaces or tokens of their own", async () => {
		await expectCode(
			visitor.notifications.find({ workspaceId }),
			"UNAUTHORIZED",
		);
		await expectCode(
			visitor.notifications.countUnread({ workspaceId }),
			"UNAUTHORIZED",
		);
		await expectCode(visitor.workspaces.find(), "UNAUTHORIZED");
		await expectCode(visitor.apiTokens.find(), "UNAUTHORIZED");
		await expectCode(visitor.auth.me(), "UNAUTHORIZED");
	});

	test("is told there's no session instead of being refused", async () => {
		expect(await visitor.auth.session()).toEqual({ user: null });
		expect((await outsider.client.auth.session()).user?.id).toBe(outsider.id);
	});

	test("is refused the same way for a project that doesn't exist", async () => {
		await expectCode(
			visitor.project.find({ projectId: "NOPE" }),
			"UNAUTHORIZED",
		);
		await expectCode(visitor.issue.find({ issueId: "NOPE-1" }), "UNAUTHORIZED");
		await expectCode(visitor.cycles.findOne({ id: "nope" }), "UNAUTHORIZED");
		await expectCode(visitor.modules.get({ id: "nope" }), "UNAUTHORIZED");
		await expectCode(
			visitor.workspace.find({ workspaceId: "nope" }),
			"UNAUTHORIZED",
		);
	});
});

describe.each(SWITCHES)("with the %s switch off", (off) => {
	beforeEach(() => open({ ...everythingOpen, [off]: false }));

	test.each(projectReads)("a visitor can't call %s", async (_name, call) => {
		await expectCode(call(visitor), "UNAUTHORIZED");
	});

	test.each(projectReads)(
		"a signed-in outsider can't call %s",
		async (_name, call) => {
			await expect(call(outsider.client)).rejects.toMatchObject({
				code: expect.stringMatching(/^(FORBIDDEN|NOT_FOUND)$/),
			});
		},
	);

	test("files stay behind sign-in", async () => {
		expect((await attachmentResponse(noHeaders, attachmentId)).status).toBe(
			401,
		);
		expect(
			(await projectBackgroundResponse(noHeaders, OPEN_PROJECT)).status,
		).toBe(401);
		expect((await avatarResponse(noHeaders, member.id)).status).toBe(401);
	});

	test("members read and write as before", async () => {
		for (const [, call] of [...workspaceReads, ...projectReads]) {
			await call(member.client);
		}
		const comment = await member.client.comments.create({
			issueId,
			body: "Still here",
		});
		await owner.client.comments.delete({ id: comment.id });
	});
});

describe("the workspace itself", () => {
	test.each(["instance", "workspace"] as const)(
		"is closed to outsiders with the %s switch off",
		async (off) => {
			await open({ ...everythingOpen, [off]: false });
			for (const [, call] of workspaceReads) {
				await expectCode(call(visitor), "UNAUTHORIZED");
				await expectCode(call(outsider.client), "FORBIDDEN");
			}
		},
	);

	test("stays open while one of its projects is private", async () => {
		await open({ ...everythingOpen, project: false });
		expect(await visitor.projects.find({ workspaceId })).toEqual([]);
		expect((await visitor.workspace.find({ workspaceId })).viewerAccess).toBe(
			"public",
		);
	});
});

describe("a private project in a public workspace", () => {
	test("isn't listed for outsiders", async () => {
		for (const client of [visitor, outsider.client]) {
			const projects = await client.projects.find({ workspaceId });
			expect(projects.map((project) => project.id)).toEqual([OPEN_PROJECT]);
		}
		const mine = await owner.client.projects.find({ workspaceId });
		expect(mine.map((project) => project.id).sort()).toEqual([
			OPEN_PROJECT,
			SECRET_PROJECT,
		]);
	});

	test("can't be read by a visitor", async () => {
		const reads: Read[] = [
			["project.find", (c) => c.project.find({ projectId: SECRET_PROJECT })],
			["issues.find", (c) => c.issues.find({ projectId: SECRET_PROJECT })],
			["states.find", (c) => c.states.find({ projectId: SECRET_PROJECT })],
			["issue.find", (c) => c.issue.find({ issueId: secretIssueId })],
			["comments.find", (c) => c.comments.find({ issueId: secretIssueId })],
			[
				"projectMembers.find",
				(c) => c.projectMembers.find({ projectId: SECRET_PROJECT }),
			],
		];
		for (const [name, call] of reads) {
			await expect(call(visitor), name).rejects.toMatchObject({
				code: "UNAUTHORIZED",
			});
			await expect(call(outsider.client), name).rejects.toMatchObject({
				code: "FORBIDDEN",
			});
		}
	});

	test("doesn't show through a relation from a public work item", async () => {
		const forOwner = await owner.client.issueRelations.find({ issueId });
		expect(forOwner.map((relation) => relation.issue.id).sort()).toEqual(
			[relatedIssueId, secretIssueId].sort(),
		);

		for (const client of [visitor, outsider.client]) {
			const relations = await client.issueRelations.find({ issueId });
			expect(relations.map((relation) => relation.issue.id)).toEqual([
				relatedIssueId,
			]);
			expect(JSON.stringify(relations)).not.toContain(SECRET_TITLE);
		}
	});
});

describe("someone signed in who isn't a member", () => {
	test("reads exactly what a visitor reads", async () => {
		for (const [name, call] of [...workspaceReads, ...projectReads]) {
			expect(await call(outsider.client), name).toEqual(await call(visitor));
		}
	});

	test.each(writes)("can't call %s", async (_name, call) => {
		await expectCode(call(outsider.client), "FORBIDDEN");
	});

	test.each(membersOnlyReads)("can't call %s", async (_name, call) => {
		await expectCode(call(outsider.client), "FORBIDDEN");
	});

	test("reads a public project in their own workspace before joining it", async () => {
		const issues = await colleague.client.issues.find({
			projectId: OPEN_PROJECT,
		});
		expect(issues).toHaveLength(2);
		await expectCode(
			colleague.client.comments.create({ issueId, body: "Not yet" }),
			"FORBIDDEN",
		);
	});
});

describe("members and admins", () => {
	test("keep their own view of a public project", async () => {
		const members = await member.client.projectMembers.find({
			projectId: OPEN_PROJECT,
		});
		expect(
			members.find((person) => person.userId === owner.id)?.email,
		).toContain(EMAIL_DOMAIN);

		expect(
			(await member.client.workspace.find({ workspaceId })).viewerAccess,
		).toBe("member");
		expect(
			(await instanceAdmin.client.workspace.find({ workspaceId })).viewerAccess,
		).toBe("instanceAdmin");

		const comments = await member.client.comments.find({ issueId });
		expect(first(first(comments).reactions).reacted).toBe(true);
	});

	test("still comment, react and manage", async () => {
		const comment = await member.client.comments.create({
			issueId,
			body: "On it",
		});
		expect(
			await member.client.comments.setReaction({
				commentId: comment.id,
				emoji: "🎉",
				reacted: true,
			}),
		).toEqual({ reacted: true });
		await member.client.comments.delete({ id: comment.id });

		await expectCode(
			member.client.project.update({
				projectId: OPEN_PROJECT,
				name: "Renamed",
			}),
			"FORBIDDEN",
		);
		const secret = await instanceAdmin.client.issues.find({
			projectId: SECRET_PROJECT,
		});
		expect(secret.map((issue) => issue.title)).toEqual([SECRET_TITLE]);
	});

	test("can't relate their items to a public project they aren't in", async () => {
		await addMember(SECRET_PROJECT, colleague.id, "member");
		try {
			await expectCode(
				colleague.client.issueRelations.add({
					issueId: secretIssueId,
					relatedId: relatedIssueId,
					kind: "relates",
				}),
				"NOT_FOUND",
			);
			const { id } = await owner.client.issueRelations.add({
				issueId: secretIssueId,
				relatedId: relatedIssueId,
				kind: "relates",
			});
			await owner.client.issueRelations.remove({ issueId: secretIssueId, id });
		} finally {
			await sql`DELETE FROM auth_space_member WHERE spaceId = ${SECRET_PROJECT} AND userId = ${colleague.id}`;
		}
	});
});

describe("a session cookie that no longer works", () => {
	test("still browses what is public, and nothing else", async () => {
		const gone = await createUser("gone");
		await auth.invalidateAuthSession(gone.sessionId);

		for (const headers of [gone.headers, cookie("not-a-session")]) {
			const client = clientWith(headers);
			const issues = await client.issues.find({ projectId: OPEN_PROJECT });
			expect(issues).toHaveLength(2);
			await expectCode(
				client.comments.create({ issueId, body: "Hi" }),
				"UNAUTHORIZED",
			);
			await expectCode(
				client.issues.find({ projectId: SECRET_PROJECT }),
				"UNAUTHORIZED",
			);
			expect((await attachmentResponse(headers, attachmentId)).status).toBe(
				200,
			);
			expect(await client.auth.session()).toEqual({ user: null });
		}
	});

	test("an API token that doesn't work is refused outright", async () => {
		const client = clientWith(
			new Headers({ authorization: "Bearer smelp_not-a-real-token" }),
		);
		await expectCode(
			client.issues.find({ projectId: OPEN_PROJECT }),
			"UNAUTHORIZED",
		);
		await expectCode(client.workspace.find({ workspaceId }), "UNAUTHORIZED");
	});
});

describe("files of a public project", () => {
	test("an attachment downloads without an account", async () => {
		const response = await attachmentResponse(noHeaders, attachmentId);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("the plan");

		expect((await attachmentResponse(noHeaders, "missing")).status).toBe(401);
		expect((await attachmentResponse(outsider.headers, "missing")).status).toBe(
			404,
		);
	});

	test("the board background loads without an account", async () => {
		const response = await projectBackgroundResponse(noHeaders, OPEN_PROJECT);
		expect(response.status).toBe(200);
		expect(Buffer.from(await response.arrayBuffer()).equals(png)).toBe(true);

		expect(
			(await projectBackgroundResponse(noHeaders, SECRET_PROJECT)).status,
		).toBe(401);
	});

	test("only the people on a public board show their picture", async () => {
		expect((await avatarResponse(noHeaders, member.id)).status).toBe(200);
		expect((await avatarResponse(noHeaders, outsider.id)).status).toBe(401);
		expect((await avatarResponse(member.headers, outsider.id)).status).toBe(
			200,
		);
	});
});

describe("the list of public workspaces", () => {
	test("names public workspaces, and only while the instance is public", async () => {
		expect(await visitor.instance.publicWorkspaces()).toEqual([
			{ id: workspaceId, name: "Open Books", image: null },
		]);

		await open({ ...everythingOpen, workspace: false });
		expect(await visitor.instance.publicWorkspaces()).toEqual([]);

		await open({ ...everythingOpen, instance: false });
		expect(await visitor.instance.publicWorkspaces()).toEqual([]);
		expect(await instanceAdmin.client.instance.publicWorkspaces()).toEqual([]);
	});
});

describe("who can open things up", () => {
	test("only a workspace admin makes a workspace public", async () => {
		await owner.client.workspace.update({ workspaceId, public: false });

		await expectCode(
			visitor.workspace.update({ workspaceId, public: true }),
			"UNAUTHORIZED",
		);
		for (const user of [member, outsider]) {
			await expectCode(
				user.client.workspace.update({ workspaceId, public: true }),
				"FORBIDDEN",
			);
		}
		expect((await owner.client.workspace.find({ workspaceId })).public).toBe(0);

		const updated = await owner.client.workspace.update({
			workspaceId,
			public: true,
		});
		expect(updated).toMatchObject({ public: 1, name: "Open Books" });
		await visitor.workspace.find({ workspaceId });
	});

	test("renaming a workspace leaves it as public as it was", async () => {
		await owner.client.workspace.update({ workspaceId, name: "Open Shelves" });
		expect(await visitor.workspace.find({ workspaceId })).toMatchObject({
			name: "Open Shelves",
			public: 1,
		});
		await owner.client.workspace.update({ workspaceId, name: "Open Books" });
	});

	test("a workspace can be made public before the instance allows it", async () => {
		await open({ instance: false, workspace: false, project: true });

		await owner.client.workspace.update({ workspaceId, public: true });
		expect((await owner.client.workspace.find({ workspaceId })).public).toBe(1);
		await expectCode(visitor.workspace.find({ workspaceId }), "UNAUTHORIZED");

		await instanceAdmin.client.instance.update({ publicAccess: true });
		await visitor.workspace.find({ workspaceId });
	});

	test("only an instance admin turns public access on or off", async () => {
		await instanceAdmin.client.instance.update({ publicAccess: false });

		await expectCode(
			visitor.instance.update({ publicAccess: true }),
			"UNAUTHORIZED",
		);
		for (const user of [owner, outsider]) {
			await expectCode(
				user.client.instance.update({ publicAccess: true }),
				"FORBIDDEN",
			);
		}
		expect((await visitor.instance.status()).publicAccess).toBe(false);

		expect(
			await instanceAdmin.client.instance.update({ publicAccess: true }),
		).toMatchObject({ publicAccess: true });
		expect((await visitor.instance.status()).publicAccess).toBe(true);
	});

	test("public access and sign-up are switched separately", async () => {
		const { signupOpen } = await visitor.instance.status();

		await instanceAdmin.client.instance.update({ publicAccess: false });
		expect(await visitor.instance.status()).toMatchObject({
			publicAccess: false,
			signupOpen,
		});

		await instanceAdmin.client.instance.update({ signupOpen: !signupOpen });
		expect(await visitor.instance.status()).toMatchObject({
			publicAccess: false,
			signupOpen: !signupOpen,
		});
		await instanceAdmin.client.instance.update({ signupOpen });
	});
});
