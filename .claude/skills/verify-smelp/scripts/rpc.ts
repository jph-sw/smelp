// Calls the API as the seeded admin. Usage: bun rpc.ts <run-dir> <procedure> [json]
// Prints the response's json. Exits 1 on a non-200 answer.
import path from "node:path";

const [dir, procedure, input = "{}"] = process.argv.slice(2);
if (!dir || !procedure) {
	console.error("usage: rpc.ts <run-dir> <procedure> [json]");
	process.exit(2);
}
const env = Object.fromEntries(
	(await Bun.file(path.join(dir, "env")).text())
		.split("\n")
		.filter(Boolean)
		.map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
);
const seed = await Bun.file(path.join(dir, "seed.json")).json();
const res = await fetch(`${env.BASE}/rpc/${procedure}`, {
	method: "POST",
	headers: { "content-type": "application/json", cookie: seed.cookie },
	body: JSON.stringify({ json: JSON.parse(input) }),
});
const body = (await res.json().catch(() => null)) as { json?: unknown } | null;
console.log(JSON.stringify(body?.json ?? body, null, 2));
if (res.status !== 200) {
	console.error(`${procedure} returned ${res.status}`);
	process.exit(1);
}
