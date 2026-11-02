import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	test,
} from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { useSecureCookies } from "../src/lib/cookies";
import { createWebAppHandler } from "../src/lib/web-app";

const parent = mkdtempSync(path.join(tmpdir(), "smelp-web-"));
const dist = path.join(parent, "dist");
const inline = "document.documentElement.className = 'dark'";
const html = `<!doctype html><script>${inline}</script><script type="module" src="/assets/app-abc.js"></script>`;

let handle: NonNullable<Awaited<ReturnType<typeof createWebAppHandler>>>;

beforeAll(async () => {
	mkdirSync(path.join(dist, "assets"), { recursive: true });
	writeFileSync(path.join(dist, "index.html"), html);
	writeFileSync(path.join(dist, "assets", "app-abc.js"), "console.log(1)");
	writeFileSync(path.join(dist, "robots.txt"), "User-agent: *");
	writeFileSync(path.join(parent, "secret.txt"), "outside");
	const handler = await createWebAppHandler(dist);
	if (!handler) throw new Error("Expected a handler");
	handle = handler;
});
afterAll(() => rmSync(parent, { recursive: true, force: true }));

const get = (pathname: string, method = "GET") =>
	handle(new Request(`http://smelp.test${pathname}`, { method }));

describe("serving the web app", () => {
	test("serves the page for the app's own addresses, so reloading works", async () => {
		for (const address of [
			"/",
			"/signin",
			"/team/projects/WEB",
			"/reset-password/abc_DEF-123",
			"/looks.like/a-file.txt",
		]) {
			const res = await get(address);
			expect(res.status).toBe(200);
			expect(res.headers.get("content-type")).toContain("text/html");
			expect(res.headers.get("cache-control")).toBe("no-cache");
			expect(await res.text()).toBe(html);
		}
	});

	test("serves built assets with a long cache and the right type", async () => {
		const res = await get("/assets/app-abc.js");
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("javascript");
		expect(res.headers.get("cache-control")).toContain("immutable");
		expect(await res.text()).toBe("console.log(1)");
	});

	test("serves other built files without the long cache", async () => {
		const res = await get("/robots.txt");
		expect(await res.text()).toBe("User-agent: *");
		expect(res.headers.get("cache-control")).toBe("no-cache");
	});

	test("a missing asset is a 404, not a web page", async () => {
		const res = await get("/assets/old-chunk.js");
		expect(res.status).toBe(404);
		expect(await res.text()).not.toContain("<!doctype");
	});

	test("a wrong API address is a 404, not a web page", async () => {
		for (const address of ["/api", "/api/nope", "/rpc/nope"]) {
			const res = await get(address);
			expect(res.status).toBe(404);
			expect(await res.text()).not.toContain("<!doctype");
		}
	});

	test("nothing outside the build can be read", async () => {
		for (const address of [
			"/../secret.txt",
			"/..%2fsecret.txt",
			"/%2e%2e/secret.txt",
			"/%2e%2e%2fsecret.txt",
			"/assets/..%2f..%2fsecret.txt",
			"/assets/%2e%2e%2f%2e%2e%2fsecret.txt",
		]) {
			const res = await get(address);
			expect(await res.text()).not.toContain("outside");
		}
	});

	test("a malformed address doesn't crash it", async () => {
		expect((await get("/%E0%A4%A")).status).toBe(404);
		expect((await get("/%00")).status).toBe(200);
	});

	test("only reads are allowed", async () => {
		for (const method of ["POST", "PUT", "DELETE"]) {
			expect((await get("/signin", method)).status).toBe(405);
		}
		expect((await get("/signin", "HEAD")).status).toBe(200);
	});

	test("protects every response", async () => {
		for (const address of ["/", "/assets/app-abc.js", "/assets/gone.js"]) {
			const headers = (await get(address)).headers;
			expect(headers.get("x-content-type-options")).toBe("nosniff");
			expect(headers.get("referrer-policy")).toBe("no-referrer");
			expect(headers.get("content-security-policy")).toContain(
				"frame-ancestors 'none'",
			);
		}
	});

	test("allows the page's own inline script by hash, and nothing else inline", async () => {
		const policy = (await get("/")).headers.get("content-security-policy");
		const hash = createHash("sha256").update(inline).digest("base64");
		const scripts = policy?.split("; ").find((d) => d.startsWith("script-src"));
		expect(scripts).toBe(`script-src 'self' 'sha256-${hash}'`);
		expect(scripts).not.toContain("unsafe");
	});

	test("without a build, there's no handler", async () => {
		expect(await createWebAppHandler(path.join(parent, "nope"))).toBeNull();
	});
});

describe("compression", () => {
	const getGzip = (pathname: string, encoding = "gzip, deflate, br") =>
		handle(
			new Request(`http://smelp.test${pathname}`, {
				headers: { "accept-encoding": encoding },
			}),
		);
	const body = async (res: Response) =>
		Buffer.from(
			Bun.gunzipSync(new Uint8Array(await res.arrayBuffer())),
		).toString();

	test("compresses scripts and pages for browsers that accept it", async () => {
		for (const [address, expected, type] of [
			["/assets/app-abc.js", "console.log(1)", "javascript"],
			["/signin", html, "text/html"],
			["/", html, "text/html"],
		] as const) {
			// Twice, so the second comes from the kept copy.
			for (let i = 0; i < 2; i += 1) {
				const res = await getGzip(address);
				expect(res.headers.get("content-encoding")).toBe("gzip");
				expect(res.headers.get("content-type")).toContain(type);
				expect(res.headers.get("vary")).toBe("Accept-Encoding");
				expect(await body(res)).toBe(expected);
			}
		}
	});

	test("keeps protections and caching on compressed responses", async () => {
		const headers = (await getGzip("/assets/app-abc.js")).headers;
		expect(headers.get("cache-control")).toContain("immutable");
		expect(headers.get("x-content-type-options")).toBe("nosniff");
		expect(headers.get("content-security-policy")).toContain("default-src");
	});

	test("sends plain files to clients that don't accept it", async () => {
		const res = await getGzip("/assets/app-abc.js", "identity");
		expect(res.headers.get("content-encoding")).toBeNull();
		expect(await res.text()).toBe("console.log(1)");
	});
});

describe("secure cookies", () => {
	const original = { ...process.env };
	afterEach(() => {
		process.env.NODE_ENV = original.NODE_ENV;
		delete process.env.SECURE_COOKIES;
	});

	test("are on in production and off in development", () => {
		process.env.NODE_ENV = "production";
		expect(useSecureCookies()).toBe(true);
		process.env.NODE_ENV = "development";
		expect(useSecureCookies()).toBe(false);
	});

	test("can only be turned off explicitly", () => {
		process.env.NODE_ENV = "production";
		for (const value of ["true", "1", "no", ""]) {
			process.env.SECURE_COOKIES = value;
			expect(useSecureCookies()).toBe(true);
		}
		process.env.SECURE_COOKIES = "false";
		expect(useSecureCookies()).toBe(false);
	});
});
