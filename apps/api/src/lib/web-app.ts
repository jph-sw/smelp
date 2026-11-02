import { createHash } from "node:crypto";
import path from "node:path";

// Inline scripts in index.html are allowed by hash, so nothing else inline can run.
function contentSecurityPolicy(html: string) {
	const inlineScripts = [
		...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g),
	].map((match) => {
		const hash = createHash("sha256")
			.update(match[1] ?? "")
			.digest("base64");
		return `'sha256-${hash}'`;
	});

	return [
		"default-src 'self'",
		`script-src 'self' ${inlineScripts.join(" ")}`.trim(),
		// The UI components position themselves with inline styles.
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data: blob:",
		"object-src 'none'",
		"base-uri 'none'",
		"form-action 'self'",
		"frame-ancestors 'none'",
	].join("; ");
}

const COMPRESSIBLE = /\.(js|css|html|svg|json|txt)$/;

// Compressed once and kept, since built files never change while running. A reverse
// proxy isn't required, and one that compresses too simply passes this through.
const compressed = new Map<string, Uint8Array<ArrayBuffer>>();
async function gzipOf(file: ReturnType<typeof Bun.file>, key: string) {
	let body = compressed.get(key);
	if (!body) {
		body = new Uint8Array(Bun.gzipSync(await file.bytes()));
		compressed.set(key, body);
	}
	return body;
}

const acceptsGzip = (request: Request) =>
	/\bgzip\b/.test(request.headers.get("accept-encoding") ?? "");

// Returns null when the web app hasn't been built, so the API can still run alone.
export async function createWebAppHandler(directory: string) {
	const root = path.resolve(directory);
	const indexFile = Bun.file(path.join(root, "index.html"));
	if (!(await indexFile.exists())) return null;

	const html = await indexFile.text();
	const securityHeaders = {
		"Content-Security-Policy": contentSecurityPolicy(html),
		"X-Content-Type-Options": "nosniff",
		// Invite and reset links hold secrets, so they must not leak to other sites.
		"Referrer-Policy": "no-referrer",
	};
	const notFound = (status = 404) =>
		new Response(status === 405 ? "Method not allowed" : "Not found", {
			status,
			headers: securityHeaders,
		});

	return async (request: Request) => {
		if (request.method !== "GET" && request.method !== "HEAD") {
			return notFound(405);
		}

		const url = new URL(request.url);
		// Anything left under these is a wrong address, which must not get a web page.
		if (
			url.pathname === "/api" ||
			url.pathname.startsWith("/api/") ||
			url.pathname.startsWith("/rpc/")
		) {
			return notFound();
		}

		let decoded: string;
		try {
			decoded = decodeURIComponent(url.pathname);
		} catch {
			return notFound();
		}
		const filePath = path.join(root, decoded);
		const isInside = filePath.startsWith(root + path.sep);
		const isAsset = url.pathname.startsWith("/assets/");

		if (isInside && !decoded.includes("\0") && filePath !== indexFile.name) {
			const file = Bun.file(filePath);
			if (await file.exists()) {
				const headers: Record<string, string> = {
					...securityHeaders,
					// Built assets have a hash in their name, so a copy never goes stale.
					"Cache-Control": isAsset
						? "public, max-age=31536000, immutable"
						: "no-cache",
				};
				if (!COMPRESSIBLE.test(filePath))
					return new Response(file, { headers });

				headers.Vary = "Accept-Encoding";
				if (!acceptsGzip(request)) return new Response(file, { headers });
				return new Response(await gzipOf(file, filePath), {
					headers: {
						...headers,
						"Content-Type": file.type,
						"Content-Encoding": "gzip",
					},
				});
			}
		}

		// A missing script after an upgrade should fail as one, not parse a web page.
		if (isAsset) return notFound();

		// Every other address belongs to the app's own router. Always revalidated, so
		// an upgrade reaches people straight away.
		const headers = {
			...securityHeaders,
			"Content-Type": "text/html;charset=utf-8",
			"Cache-Control": "no-cache",
			Vary: "Accept-Encoding",
		};
		if (!acceptsGzip(request)) return new Response(html, { headers });
		return new Response(await gzipOf(indexFile, indexFile.name ?? "index"), {
			headers: { ...headers, "Content-Encoding": "gzip" },
		});
	};
}
