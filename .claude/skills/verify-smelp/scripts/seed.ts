// Seeds a fresh instance through the real API: the first account (instance admin),
// a workspace, a project and one work item. Writes seed.json and the browser
// session (storage.json) into the run directory. Usage: bun seed.ts <run-dir>
import path from "node:path";

const dir = process.argv[2];
if (!dir) throw new Error("usage: seed.ts <run-dir>");
const env = Object.fromEntries(
	(await Bun.file(path.join(dir, "env")).text())
		.split("\n")
		.filter(Boolean)
		.map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
);
const base = env.BASE as string;

let cookie = "";
let token = "";
async function ok<T = Record<string, string>>(procedure: string, json: unknown = {}) {
	const res = await fetch(`${base}/rpc/${procedure}`, {
		method: "POST",
		headers: { "content-type": "application/json", cookie },
		body: JSON.stringify({ json }),
	});
	const session = res.headers.getSetCookie().find((c) => c.startsWith("auth_session="));
	if (session) {
		cookie = session.split(";")[0] ?? "";
		token = cookie.slice("auth_session=".length);
	}
	const body = (await res.json().catch(() => null)) as { json: T } | null;
	if (res.status !== 200)
		throw new Error(`${procedure} returned ${res.status}: ${JSON.stringify(body)}`);
	return body?.json as T;
}

const account = {
	email: "verify@example.test",
	password: "correct-horse-battery",
	fullName: "Vera Verify",
	displayName: "vera",
};
await ok("auth/signUp", account);
const workspace = await ok("workspace/create", { name: "Verify Team" });
await ok("project/create", {
	id: "VER",
	name: "Verification",
	description: "",
	access: "public",
	icon: "",
	workspaceId: workspace.id,
});
const states = await ok<{ id: string; name: string }[]>("states/find", { projectId: "VER" });
const issue = await ok("issue/create", {
	title: "Seeded work item",
	description: "",
	state: states[0]?.id,
	type: "task",
	workspaceId: workspace.id,
	projectId: "VER",
});

const seed = {
	account,
	cookie,
	workspaceId: workspace.id,
	workspaceName: "Verify Team",
	projectId: "VER",
	projectName: "Verification",
	states: states.map((s) => s.name),
	issue: { id: issue.id, title: "Seeded work item" },
};
await Bun.write(path.join(dir, "seed.json"), JSON.stringify(seed, null, 2));
// Same cookie the browser would get from signing in (Secure works on localhost).
await Bun.write(
	path.join(dir, "storage.json"),
	JSON.stringify({
		cookies: [
			{
				name: "auth_session",
				value: token,
				domain: "localhost",
				path: "/",
				expires: -1,
				httpOnly: true,
				secure: true,
				sameSite: "Lax",
			},
		],
		origins: [],
	}),
);
console.log(`  seeded ${account.email}, workspace ${workspace.id}, project VER, item ${issue.id}`);
