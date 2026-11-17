// Upgrades a real database from one version of smelp to another and checks nothing
// was lost. Run it before tagging a release, from the previous release's tag:
//
//   bun run test:upgrade v0.1.0          # from v0.1.0 to this working tree
//   bun run test:upgrade v0.1.0 v0.2.0   # between two tags
//
// By default each version runs in Docker the way the README installs it, on one
// volume. --bun runs them with Bun instead, for versions from before the Dockerfile.
// Deletes only what it creates: its own containers, volume, images and checkouts.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { $ } from "bun";

const args = process.argv.slice(2);
const useBun = args.includes("--bun");
const [from, to] = args.filter((arg) => !arg.startsWith("--"));
if (!from) {
	console.error("Usage: bun run test:upgrade <from-ref> [to-ref] [--bun]");
	process.exit(2);
}

const repo = path.resolve(import.meta.dir, "..");
const port = Number(process.env.UPGRADE_TEST_PORT ?? 3310);
const base = `http://localhost:${port}`;
const name = "smelp-upgrade-test";
const work = mkdtempSync(path.join(tmpdir(), `${name}-`));
const cleanups: (() => Promise<unknown>)[] = [];

const step = (message: string) => console.log(`• ${message}`);
function check(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(`Check failed: ${message}`);
	console.log(`  ✓ ${message}`);
}

// A version as a directory to run: a clean checkout of the ref, or this working tree.
async function checkout(ref: string | undefined, label: string) {
	if (!ref) return repo;
	const directory = path.join(work, label);
	await $`git -C ${repo} worktree add --quiet --detach ${directory} ${ref}`;
	cleanups.push(() =>
		$`git -C ${repo} worktree remove --force ${directory}`.nothrow(),
	);
	return directory;
}

type Running = { stop: () => Promise<void>; logs: () => Promise<string> };

async function startDocker(directory: string, label: string): Promise<Running> {
	const image = `${name}:${label}`;
	step(`Building ${label}`);
	await $`docker build --quiet --tag ${image} ${directory}`.quiet();
	cleanups.push(() => $`docker image rm --force ${image}`.quiet().nothrow());
	// Same volume and restrictions as compose.yaml.
	await $`docker run --detach --name ${name} --publish 127.0.0.1:${port}:3000 --volume ${name}:/data --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges:true ${image}`.quiet();
	return {
		stop: async () => {
			await $`docker stop --time 20 ${name}`.quiet();
			await $`docker rm ${name}`.quiet();
		},
		logs: () => $`docker logs ${name}`.nothrow().quiet().text(),
	};
}

async function startBun(directory: string, label: string): Promise<Running> {
	step(`Installing ${label}`);
	// Some older commits' lockfiles were out of date, and their checkouts are thrown away.
	await $`bun install ${directory === repo ? "--frozen-lockfile" : "--no-save"}`
		.cwd(directory)
		.quiet();
	const log = path.join(work, `${label}.log`);
	const server = Bun.spawn(["bun", "apps/api/src/index.ts"], {
		cwd: directory,
		env: {
			...process.env,
			PORT: String(port),
			DATABASE_PATH: path.join(work, "smelp.sqlite"),
			NODE_ENV: "production",
		},
		stdout: Bun.file(log),
		stderr: Bun.file(log),
	});
	return {
		stop: async () => {
			server.kill("SIGTERM");
			await server.exited;
		},
		logs: () => Bun.file(log).text(),
	};
}

async function start(ref: string | undefined, label: string) {
	const directory = await checkout(ref, label);
	const running = await (useBun ? startBun : startDocker)(directory, label);
	step(`Starting ${label} (${ref ?? "working tree"})`);
	for (let tries = 0; tries < 120; tries++) {
		const ok = await fetch(`${base}/api/status`)
			.then((res) => res.ok)
			.catch(() => false);
		if (ok) return running;
		await Bun.sleep(500);
	}
	console.error(await running.logs());
	await running.stop().catch(() => {});
	throw new Error(`${label} didn't become healthy`);
}

let cookie = "";
async function rpc<T = Record<string, string>>(
	procedure: string,
	json: unknown = {},
) {
	const res = await fetch(`${base}/rpc/${procedure}`, {
		method: "POST",
		headers: { "content-type": "application/json", cookie },
		body: JSON.stringify({ json }),
	});
	const session = res.headers
		.getSetCookie()
		.find((c) => c.startsWith("auth_session="));
	if (session) cookie = session.split(";")[0] ?? "";
	const body = (await res.json().catch(() => null)) as { json: T } | null;
	return { status: res.status, data: body?.json as T };
}
async function ok<T = Record<string, string>>(
	procedure: string,
	json: unknown = {},
) {
	const { status, data } = await rpc<T>(procedure, json);
	if (status !== 200)
		throw new Error(`${procedure} returned ${status}: ${JSON.stringify(data)}`);
	return data;
}

const account = {
	email: "upgrade@example.test",
	password: "correct-horse-battery",
	fullName: "Upgrade Test",
	displayName: "upgradetest",
};
const issueTitle = "Survives the upgrade";
const commentBody = "So does this comment";

try {
	await $`docker volume rm --force ${name}`.quiet().nothrow();
	const before = await start(from, "from");
	cleanups.push(() => before.stop().catch(() => {}));

	step("Adding data to the old version");
	await ok("auth/signUp", account);
	const workspace = await ok("workspace/create", { name: "Upgrade Team" });
	await ok("project/create", {
		id: "UPG",
		name: "Upgrade",
		description: "",
		access: "public",
		icon: "",
		workspaceId: workspace.id,
	});
	const states = await ok<{ id: string }[]>("states/find", {
		projectId: "UPG",
	});
	const issue = await ok("issue/create", {
		title: issueTitle,
		description: "",
		state: states[0]?.id,
		type: "task",
		workspaceId: workspace.id,
		projectId: "UPG",
	});
	// Older versions may not have every feature yet.
	const comment = await rpc("comments/create", {
		issueId: issue.id,
		body: commentBody,
	});
	const hasComments = comment.status === 200;
	console.log(hasComments ? "  + comment" : "  - no comments in this version");
	const apiToken = await rpc<{ token: string }>("apiTokens/create", {
		name: "Upgrade agent",
		expiresInDays: null,
	});
	const hasApiTokens = apiToken.status === 200;
	console.log(
		hasApiTokens ? "  + API token" : "  - no API tokens in this version",
	);

	await before.stop();
	cleanups.pop();

	const after = await start(to, "to");
	cleanups.push(() => after.stop().catch(() => {}));

	step("Checking the data after the upgrade");
	cookie = "";
	const signIn = await rpc("auth/signIn", {
		email: account.email,
		password: account.password,
	});
	check(signIn.status === 200, "signs in with the old password");
	const workspaces = await ok<{ id: string }[]>("workspaces/find");
	check(
		workspaces.some((w) => w.id === workspace.id),
		"keeps the workspace and membership",
	);
	const found = await ok("issue/find", { issueId: issue.id });
	check(found.title === issueTitle, "keeps the work item");
	if (hasApiTokens) {
		const mcp = await fetch(`${base}/mcp`, {
			method: "POST",
			headers: {
				authorization: `Bearer ${apiToken.data.token}`,
				"content-type": "application/json",
				accept: "application/json, text/event-stream",
			},
			body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
		});
		check(mcp.status === 200, "the old API token still works over MCP");
	}
	if (hasComments) {
		const comments = await ok<{ body: string }[]>("comments/find", {
			issueId: issue.id,
		});
		check(
			comments.some((c) => c.body === commentBody),
			"keeps the comment",
		);
	}
	const users = await rpc<{ email: string }[]>("instance/users");
	check(
		users.status === 200 && users.data.some((u) => u.email === account.email),
		"the first account is instance admin",
	);
	const version = await ok<{ version: string }>("instance/version");
	console.log(`  · now running ${version.version}`);

	// Features newer than the old version must work on its data too. A route the new
	// version doesn't have answers 404, and its check is skipped.
	const missing = (status: number) => status === 404;
	const search = await rpc<{ id: string }[]>("issues/search", {
		workspaceId: workspace.id,
		query: "upgrade",
	});
	if (!missing(search.status)) {
		check(
			search.status === 200 && search.data.some((i) => i.id === issue.id),
			"search finds the old work item",
		);
	}
	const feed = await rpc<{ events: { type: string }[] }>(
		"activity/findWorkspace",
		{
			workspaceId: workspace.id,
		},
	);
	if (!missing(feed.status)) {
		check(
			feed.status === 200 &&
				feed.data.events.some((e) => e.type === "issue.created"),
			"the activity feed shows events from before the upgrade",
		);
	}
	if (hasComments) {
		const [old] = await ok<{ id: string }[]>("comments/find", {
			issueId: issue.id,
		});
		const edit = await rpc("comments/update", {
			commentId: old?.id,
			body: "Edited after the upgrade",
		});
		if (!missing(edit.status))
			check(edit.status === 200, "the old comment can be edited");
	}
	const archived = await rpc("project/archive", { projectId: "UPG" });
	if (!missing(archived.status)) {
		check(archived.status === 200, "the old project can be archived");
		check(
			(await rpc("project/unarchive", { projectId: "UPG" })).status === 200,
			"and unarchived",
		);
	}

	// Phase 2 features, on the work item and comment from before the upgrade.
	const child = await rpc<{ id: string; parentId: string | null }>(
		"issue/create",
		{
			title: "A sub-item of an old item",
			description: "",
			state: states[0]?.id,
			type: "task",
			workspaceId: workspace.id,
			projectId: "UPG",
			parentId: issue.id,
		},
	);
	check(
		child.status === 200 && child.data.parentId === issue.id,
		"an old work item can get a sub-item",
	);
	const relation = await rpc("issueRelations/add", {
		issueId: child.data.id,
		relatedId: issue.id,
		kind: "blocks",
	});
	if (!missing(relation.status))
		check(relation.status === 200, "an old work item can be related");
	const link = await rpc("links/create", {
		issueId: issue.id,
		url: "https://example.com/upgrade",
		title: "Upgrade notes",
	});
	if (!missing(link.status))
		check(link.status === 200, "an old work item can get a link");
	if (hasComments) {
		const [old] = await ok<{ id: string }[]>("comments/find", {
			issueId: issue.id,
		});
		const reaction = await rpc("comments/setReaction", {
			commentId: old?.id,
			emoji: "🎉",
			reacted: true,
		});
		if (!missing(reaction.status))
			check(reaction.status === 200, "the old comment takes a reaction");
	}
	const upload = new FormData();
	upload.set("file", new File(["kept in the backup\n"], "upgrade.txt"));
	const attached = await fetch(`${base}/api/attachments?issueId=${issue.id}`, {
		method: "POST",
		headers: { cookie, "X-Smelp-Upload": "1" },
		body: upload,
	});
	if (!missing(attached.status)) {
		check(attached.status === 201, "a file can be attached to an old item");
		const files = await ok<{ id: string }[]>("attachments/find", {
			issueId: issue.id,
		});
		const download = await fetch(`${base}/api/attachments/${files[0]?.id}`, {
			headers: { cookie },
		});
		check(
			(await download.text()) === "kept in the backup\n",
			"and downloaded again",
		);
	}
	const inbox = await rpc<{ notifications: unknown[] }>("notifications/find", {
		workspaceId: workspace.id,
	});
	if (!missing(inbox.status)) {
		check(inbox.status === 200, "the inbox works for an old account");
		const me = await ok<{ user: { notifyByEmail?: number } }>("auth/me");
		check(
			!me.user.notifyByEmail,
			"notification email is off for the old account",
		);
	}

	// Phase 3 features, on the project and work item from before the upgrade.
	const day = (offset: number) =>
		new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
	const cycle = await rpc<{ id: string }>("cycles/create", {
		projectId: "UPG",
		name: "First cycle",
		startDate: day(-1),
		endDate: day(6),
	});
	if (!missing(cycle.status)) {
		check(cycle.status === 200, "the old project can get a cycle");
		const next = await ok<{ id: string }>("cycles/create", {
			projectId: "UPG",
			name: "Second cycle",
			startDate: day(7),
			endDate: day(13),
		});
		await ok("issue/update", { id: issue.id, cycleId: cycle.data.id });
		await ok("cycles/moveUnfinished", {
			fromCycleId: cycle.data.id,
			toCycleId: next.id,
		});
		const moved = await ok<{ cycleId: string | null }>("issue/find", {
			issueId: issue.id,
		});
		check(
			moved.cycleId === next.id,
			"the old work item joins a cycle and moves to the next one",
		);
	}
	const module = await rpc<{ id: string }>("modules/create", {
		projectId: "UPG",
		name: "Upgrade epic",
	});
	if (!missing(module.status)) {
		check(module.status === 200, "the old project can get a module");
		await ok("issue/update", { id: issue.id, moduleId: module.data.id });
		const grouped = await ok<{ moduleId: string | null }>("issue/find", {
			issueId: issue.id,
		});
		check(
			grouped.moduleId === module.data.id,
			"the old work item joins a module",
		);
	}
	const jiraCsv = [
		"Summary,Issue key,Issue id,Issue Type,Status,Project key,Project name,Status Category",
		"Imported after the upgrade,UPJ-1,30001,Task,To Do,UPJ,Upgrade Jira,To Do",
	].join("\r\n");
	const preview = await rpc("jiraImport/preview", {
		workspaceId: workspace.id,
		csv: jiraCsv,
	});
	if (!missing(preview.status)) {
		check(preview.status === 200, "a Jira CSV can be previewed");
		const imported = await rpc("jiraImport/apply", {
			workspaceId: workspace.id,
			csv: jiraCsv,
			mapping: {},
		});
		check(imported.status === 200, "and imported into the old workspace");
		const item = await ok("issue/find", { issueId: "UPJ-1" });
		check(
			item.title === "Imported after the upgrade",
			"the imported work item is there",
		);
	}

	// Sign-in options and email verification: an old account counts as verified.
	const options = await rpc<{ oidc: unknown }>("auth/signInOptions");
	if (!missing(options.status)) {
		check(
			options.status === 200 && options.data.oidc === null,
			"sign-in options answer, with SSO off",
		);
	}
	const verified = await ok<{
		user: { emailVerified?: number };
		emailVerificationPending?: boolean;
	}>("auth/me");
	if (verified.user.emailVerified !== undefined) {
		check(
			verified.user.emailVerified === 1 && !verified.emailVerificationPending,
			"the old account counts as verified",
		);
	}

	if (!useBun) {
		const backup = await $`docker exec ${name} bun run --silent backup`.text();
		check(backup.includes("Backup saved"), "backups still work");
		if (!missing(attached.status))
			check(
				backup.includes("1 attachment(s) saved"),
				"and include the attached file",
			);
	}
	console.log(`Upgrade test passed: ${from} → ${to ?? "working tree"}`);
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	// A failed command's own output says why.
	if (error instanceof $.ShellError) console.error(error.stderr.toString());
	process.exitCode = 1;
} finally {
	for (const cleanup of cleanups.reverse()) await cleanup();
	if (!useBun) await $`docker volume rm --force ${name}`.quiet().nothrow();
	rmSync(work, { recursive: true, force: true });
}
