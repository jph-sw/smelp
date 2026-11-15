// Runs one journey in headless Chromium against a verification run.
// Usage (through smelp-verify): browse.mjs <run-dir> <journey.mjs> [--fresh]
//
// A journey is an ES module whose default export receives
//   { page, base, seed, step, shot, aria, expect, evidenceDir }
// and drives the app with Playwright locators. See ../journeys/ for examples.
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

// Installed by smelp-verify into its tools folder, outside the repo.
const { chromium } = createRequire(path.join(process.env.SMELP_TOOLS, "package.json"))("playwright-core");

const [dir, journeyPath, ...flags] = process.argv.slice(2);
const fresh = flags.includes("--fresh");
const env = Object.fromEntries(
	readFileSync(path.join(dir, "env"), "utf8")
		.split("\n")
		.filter(Boolean)
		.map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const seed = JSON.parse(readFileSync(path.join(dir, "seed.json"), "utf8"));
const name = path.basename(journeyPath).replace(/\.m?js$/, "");
const evidenceDir = path.join(env.EVIDENCE, name);
mkdirSync(evidenceDir, { recursive: true });
const log = path.join(evidenceDir, "journey.log");
writeFileSync(log, `journey ${name} on ${env.BASE} (run ${env.SMELP_RUN}, build ${env.REVISION})\n`);
const note = (line) => {
	appendFileSync(log, `${line}\n`);
	console.log(line);
};

const browser = await chromium.launch();
const context = await browser.newContext({
	baseURL: env.BASE,
	viewport: { width: 1280, height: 800 },
	storageState: fresh ? undefined : path.join(dir, "storage.json"),
});
await context.tracing.start({ screenshots: true, snapshots: true });
const page = await context.newPage();
page.on("console", (m) => m.type() === "error" && note(`  console.error: ${m.text()}`));
page.on("pageerror", (e) => note(`  pageerror: ${e.message}`));
page.on("response", (r) => r.status() >= 500 && note(`  HTTP ${r.status()} ${r.url()}`));

let shots = 0;
const shot = async (label) => {
	const file = path.join(evidenceDir, `${String(++shots).padStart(2, "0")}-${label}.png`);
	await page.screenshot({ path: file, fullPage: true });
	note(`  screenshot ${file}`);
	return file;
};
const aria = async (label, locator = page.locator("body")) => {
	const file = path.join(evidenceDir, `${label}.aria.yml`);
	writeFileSync(file, await locator.ariaSnapshot());
	note(`  aria ${file}`);
	return file;
};
const step = (text) => note(`• ${text}`);
const expect = (condition, text) => {
	if (!condition) throw new Error(`Check failed: ${text}`);
	note(`  ✓ ${text}`);
};

let failed = false;
try {
	const journey = await import(pathToFileURL(path.resolve(journeyPath)).href);
	await journey.default({ page, base: env.BASE, seed, step, shot, aria, expect, evidenceDir });
	note("PASS");
} catch (error) {
	failed = true;
	note(`FAIL ${error?.stack ?? error}`);
	await shot("failure").catch(() => {});
	await aria("failure").catch(() => {});
} finally {
	await context.tracing.stop({ path: path.join(evidenceDir, "trace.zip") });
	note(`  trace ${path.join(evidenceDir, "trace.zip")} (open with: npx playwright-core@1.60.0 show-trace <file>)`);
	if (!fresh) await context.storageState({ path: path.join(dir, "storage.json") });
	await browser.close();
}
process.exit(failed ? 1 : 0);
