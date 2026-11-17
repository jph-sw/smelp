import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { createRouterClient } from "@orpc/server";

// Imported dynamically so setup.ts points the database at a temp file first.
await import("./setup");
const { Auth } = await import("@smelp/auth");
const { DB } = await import("@smelp/db");
const { router } = await import("../src/router");
const { githubWebhookResponse } = await import("../src/lib/github-webhook");
const { issueKeys } = await import("../src/lib/github");

const sql = new DB().sqlite;
const auth = new Auth();

const WORKSPACE = "github_tests";
const PROJECT = "GHB";
const OTHER_PROJECT = "GHO";
const REPO = "octo-org/smelp-test";
const REPO_URL = `https://github.com/${REPO}`;

const expectCode = (call: Promise<unknown>, code: string) =>
	expect(call).rejects.toMatchObject({ code });

const clientWith = (headers: Headers) =>
	createRouterClient(router, { context: { headers, ip: "198.51.100.12" } });

let userCount = 0;
async function createUser(name: string) {
	userCount += 1;
	const { session, user } = await auth.signUp(
		`gh-${name}-${userCount}@example.test`,
		name,
		`gh-${name}-${userCount}`,
		"correct-horse-battery",
	);
	return {
		id: user.id,
		client: clientWith(
			new Headers({ cookie: `auth_session=${session.authSessionToken}` }),
		),
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
let instanceAdmin: User;
let stateId: string;
let connectionId: string;
let secret: string;
let issueId: string;
let otherIssueId: string;

const repository = { full_name: REPO, html_url: REPO_URL, private: false };
const sender = { login: "octocat", id: 1 };

function sign(body: string, key = secret) {
	return `sha256=${createHmac("sha256", key).update(body).digest("hex")}`;
}

async function deliver(
	event: string,
	payload: unknown,
	{
		signature,
		id = connectionId,
	}: { signature?: string | null; id?: string } = {},
) {
	const body = JSON.stringify(payload);
	const headers = new Headers({
		"content-type": "application/json",
		"x-github-event": event,
		"x-github-delivery": crypto.randomUUID(),
	});
	const signed = signature === undefined ? sign(body) : signature;
	if (signed !== null) headers.set("x-hub-signature-256", signed);
	return githubWebhookResponse(
		new Request(`http://localhost/api/github/webhook/${id}`, {
			method: "POST",
			headers,
			body,
		}),
		id,
	);
}

const pullRequest = (
	overrides: Partial<{
		action: string;
		title: string;
		body: string | null;
		state: "open" | "closed";
		merged: boolean;
		number: number;
	}> = {},
) => {
	const { action = "opened", number = 3, merged = false } = overrides;
	return {
		action,
		number,
		pull_request: {
			number,
			title: overrides.title ?? "Fix the board",
			body: overrides.body === undefined ? "Closes GHB-1" : overrides.body,
			html_url: `${REPO_URL}/pull/${number}`,
			state: overrides.state ?? "open",
			merged,
			merged_at: merged ? "2026-11-17T10:00:00Z" : null,
			user: { login: "pr-author", id: 2 },
			head: { ref: "feature/board", sha: "abc" },
			base: { ref: "main" },
		},
		repository,
		sender,
	};
};

async function refs(id = issueId, client = member.client) {
	return client.githubRefs.find({ issueId: id });
}

async function githubActivity(id: string) {
	const activity = await member.client.activity.findForIssue({ issueId: id });
	return activity.filter((entry) => entry.action.includes("pull_request"));
}

beforeAll(async () => {
	admin = await createUser("admin");
	member = await createUser("member");
	instanceAdmin = await createUser("instance-admin");
	await sql`UPDATE auth_user SET role = 'admin' WHERE id = ${instanceAdmin.id}`;

	await admin.client.workspace.create({ name: "GitHub tests" });
	for (const id of [PROJECT, OTHER_PROJECT]) {
		await admin.client.project.create({
			id,
			name: `GitHub ${id}`,
			description: "",
			access: "private",
			icon: "AppWindowIcon",
			workspaceId: WORKSPACE,
		});
	}
	await addMember(WORKSPACE, member.id, "member");
	await addMember(PROJECT, member.id, "member");

	stateId =
		(await admin.client.states.find({ projectId: PROJECT }))[0]?.id ?? "";
	const otherStateId =
		(await admin.client.states.find({ projectId: OTHER_PROJECT }))[0]?.id ?? "";
	const newIssue = (projectId: string, state: string) =>
		admin.client.issue.create({
			title: "Linked from GitHub",
			description: "",
			state,
			workspaceId: WORKSPACE,
			projectId,
		});
	issueId = (await newIssue(PROJECT, stateId)).id;
	otherIssueId = (await newIssue(OTHER_PROJECT, otherStateId)).id;

	const connection = await admin.client.githubRepo.connect({
		projectId: PROJECT,
		repo: ` https://github.com/${REPO}.git `,
	});
	connectionId = connection.webhookPath.split("/").at(-1) ?? "";
	secret = connection.secret;
});

describe("connecting a repository", () => {
	test("gives the webhook address and secret once, and reads never show the secret", async () => {
		expect(issueId).toBe(`${PROJECT}-1`);
		const found = await admin.client.githubRepo.find({ projectId: PROJECT });
		expect(found).toEqual({
			repo: REPO,
			webhookPath: `/api/github/webhook/${connectionId}`,
			createdAt: expect.any(Number),
		});
		expect(JSON.stringify(found)).not.toContain(secret);
		expect(secret).toMatch(/^[0-9a-f]{64}$/);
	});

	test("only a project admin may connect, regenerate or disconnect", async () => {
		await expectCode(
			member.client.githubRepo.connect({
				projectId: OTHER_PROJECT,
				repo: REPO,
			}),
			"FORBIDDEN",
		);
		await expectCode(
			member.client.githubRepo.regenerateSecret({ projectId: PROJECT }),
			"FORBIDDEN",
		);
		await expectCode(
			member.client.githubRepo.disconnect({ projectId: PROJECT }),
			"FORBIDDEN",
		);
		await expectCode(
			member.client.githubRepo.find({ projectId: PROJECT }),
			"FORBIDDEN",
		);
	});

	test("refuses a second repository and a malformed name", async () => {
		await expectCode(
			admin.client.githubRepo.connect({ projectId: PROJECT, repo: "a/b" }),
			"CONFLICT",
		);
		await expectCode(
			admin.client.githubRepo.connect({
				projectId: OTHER_PROJECT,
				repo: "not a repo",
			}),
			"BAD_REQUEST",
		);
	});
});

describe("webhook deliveries", () => {
	test("answers ping", async () => {
		const response = await deliver("ping", {
			zen: "Keep it simple.",
			hook_id: 1,
		});
		expect(response.status).toBe(200);
	});

	test("refuses a bad or missing signature", async () => {
		const create = {
			ref: "GHB-1-unsigned",
			ref_type: "branch",
			repository,
			sender,
		};
		expect((await deliver("create", create, { signature: null })).status).toBe(
			401,
		);
		expect(
			(await deliver("create", create, { signature: sign("other body") }))
				.status,
		).toBe(401);
		expect(
			(await deliver("create", create, { signature: "sha256=zz" })).status,
		).toBe(401);
		expect(await refs()).toEqual([]);
	});

	test("refuses a body over 1 MB before reading it", async () => {
		const response = await deliver("push", {
			ref: "refs/heads/main",
			padding: "x".repeat(1024 * 1024),
			repository,
		});
		expect(response.status).toBe(413);
	});

	test("links a new branch named after the item", async () => {
		const response = await deliver("create", {
			ref: "ghb-1-foo",
			ref_type: "branch",
			master_branch: "main",
			repository,
			sender,
		});
		expect(response.status).toBe(200);
		expect(await refs()).toEqual([
			expect.objectContaining({
				kind: "branch",
				repo: REPO,
				ref: "ghb-1-foo",
				url: `${REPO_URL}/tree/ghb-1-foo`,
				state: null,
				author: "octocat",
			}),
		]);
	});

	test("links each commit of a push and the pushed branch", async () => {
		const sha = "a".repeat(40);
		const response = await deliver("push", {
			ref: "refs/heads/GHB-1-foo",
			before: "0".repeat(40),
			after: sha,
			deleted: false,
			repository,
			sender,
			pusher: { name: "octocat", email: "octocat@example.test" },
			commits: [
				{
					id: sha,
					message: "GHB-1 fix\n\nLonger explanation.",
					url: `${REPO_URL}/commit/${sha}`,
					author: {
						name: "Octo Cat",
						email: "octocat@example.test",
						username: "octocat",
					},
				},
				{
					id: "b".repeat(40),
					message: "Unrelated tidy-up",
					url: `${REPO_URL}/commit/${"b".repeat(40)}`,
					author: { name: "Octo Cat", email: "octocat@example.test" },
				},
			],
		});
		expect(response.status).toBe(200);
		const linked = await refs();
		expect(linked.map(({ kind, ref }) => [kind, ref])).toEqual([
			["branch", "GHB-1-foo"],
			["branch", "ghb-1-foo"],
			["commit", sha],
		]);
		expect(linked.find((ref) => ref.kind === "commit")).toMatchObject({
			title: "GHB-1 fix",
			author: "octocat",
			url: `${REPO_URL}/commit/${sha}`,
		});
	});

	test("links a pull request once however often it is delivered or edited", async () => {
		expect((await deliver("pull_request", pullRequest())).status).toBe(200);
		await deliver("pull_request", pullRequest());
		await deliver(
			"pull_request",
			pullRequest({ action: "edited", title: "Fix the board for good" }),
		);

		const pulls = (await refs()).filter((ref) => ref.kind === "pull_request");
		expect(pulls).toEqual([
			expect.objectContaining({
				ref: "3",
				title: "Fix the board for good",
				url: `${REPO_URL}/pull/3`,
				state: "open",
				author: "pr-author",
			}),
		]);

		await Bun.sleep(50);
		const activity = await githubActivity(issueId);
		expect(activity).toEqual([
			expect.objectContaining({
				action: "issue.pull_request_linked",
				newValue: "3",
				actorName: "octocat",
			}),
		]);
	});

	test("marks a merged pull request and logs the merge once", async () => {
		const merged = pullRequest({
			action: "closed",
			state: "closed",
			merged: true,
		});
		expect((await deliver("pull_request", merged)).status).toBe(200);
		await deliver("pull_request", merged);

		const pulls = (await refs()).filter((ref) => ref.kind === "pull_request");
		expect(pulls).toEqual([
			expect.objectContaining({ ref: "3", state: "merged" }),
		]);

		await Bun.sleep(50);
		const actions = (await githubActivity(issueId)).map((e) => e.action);
		expect(actions).toEqual([
			"issue.pull_request_linked",
			"issue.pull_request_merged",
		]);
	});

	test("a pull request closed without merging is closed", async () => {
		await deliver(
			"pull_request",
			pullRequest({ number: 4, body: "GHB-1", action: "opened" }),
		);
		await deliver(
			"pull_request",
			pullRequest({
				number: 4,
				body: "GHB-1",
				action: "closed",
				state: "closed",
			}),
		);
		const pull = (await refs()).find(
			(ref) => ref.kind === "pull_request" && ref.ref === "4",
		);
		expect(pull?.state).toBe("closed");
	});

	test("ignores another repository, other projects' keys and items that don't exist", async () => {
		const before = await refs();
		const response = await deliver("create", {
			ref: "GHB-1-elsewhere",
			ref_type: "branch",
			repository: {
				full_name: "someone/else",
				html_url: "https://github.com/someone/else",
			},
			sender,
		});
		expect(response.status).toBe(200);
		expect(await refs()).toEqual(before);

		await deliver(
			"pull_request",
			pullRequest({
				number: 9,
				title: `${otherIssueId} and GHB-999 and XGHB-1 and GHB-10`,
				body: null,
			}),
		);
		expect(await refs()).toEqual(before);
		expect(await refs(otherIssueId, admin.client)).toEqual([]);
	});

	test("an archived project links nothing until it is unarchived", async () => {
		const before = await refs();
		const branch = {
			ref: "GHB-1-archived",
			ref_type: "branch",
			repository,
			sender,
		};
		await admin.client.project.archive({ projectId: PROJECT });
		try {
			expect((await deliver("create", branch)).status).toBe(200);
			expect(await refs()).toEqual(before);
		} finally {
			await admin.client.project.unarchive({ projectId: PROJECT });
		}
		await deliver("create", branch);
		expect((await refs()).map((ref) => ref.ref)).toContain("GHB-1-archived");
	});

	test("an unknown connection is not found", async () => {
		const response = await deliver("ping", {}, { id: crypto.randomUUID() });
		expect(response.status).toBe(404);
	});
});

describe("item keys in text", () => {
	test("match whole keys in any case, and nothing longer", () => {
		expect(issueKeys("smelp-1-foo", "SMELP")).toEqual(["SMELP-1"]);
		expect(issueKeys("SMELP-1 fix", "SMELP")).toEqual(["SMELP-1"]);
		expect(issueKeys("feat/SMELP-2_and SMELP-2", "SMELP")).toEqual(["SMELP-2"]);
		expect(issueKeys("XSMELP-1 SMELP-10 SMELP-1a", "SMELP")).toEqual([
			"SMELP-10",
		]);
	});
});

describe("regenerating and disconnecting", () => {
	test("a regenerated secret replaces the old one", async () => {
		const old = secret;
		const regenerated = await admin.client.githubRepo.regenerateSecret({
			projectId: PROJECT,
		});
		expect(regenerated.secret).not.toBe(old);
		expect(
			(await deliver("ping", {}, { signature: sign("{}", old) })).status,
		).toBe(401);
		secret = regenerated.secret;
		expect((await deliver("ping", {})).status).toBe(200);
	});
});

describe("on a public project", () => {
	const visitor = clientWith(new Headers());

	afterAll(async () => {
		// Other test files share this database and expect a closed instance.
		await admin.client.workspace.update({
			workspaceId: WORKSPACE,
			public: false,
		});
		await instanceAdmin.client.instance.update({ publicAccess: false });
	});

	test("anyone who can read the item sees its development list", async () => {
		await expectCode(refs(issueId, visitor), "UNAUTHORIZED");

		await instanceAdmin.client.instance.update({ publicAccess: true });
		await admin.client.workspace.update({
			workspaceId: WORKSPACE,
			public: true,
		});
		await admin.client.project.update({ projectId: PROJECT, access: "public" });

		const linked = await refs(issueId, visitor);
		expect(linked.map((ref) => ref.kind)).toContain("pull_request");
		await expectCode(
			visitor.githubRepo.find({ projectId: PROJECT }),
			"UNAUTHORIZED",
		);
	});

	test("disconnecting stops deliveries and keeps what was linked", async () => {
		await admin.client.githubRepo.disconnect({ projectId: PROJECT });
		expect(
			await admin.client.githubRepo.find({ projectId: PROJECT }),
		).toBeNull();
		expect((await deliver("ping", {})).status).toBe(404);
		expect((await refs()).length).toBeGreaterThan(0);
	});
});
