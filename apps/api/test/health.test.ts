import { describe, expect, spyOn, test } from "bun:test";
import { ORPCError } from "@orpc/server";

// Imported dynamically so setup.ts points the database at a temp file first.
await import("./setup");
const { statusResponse } = await import("../src/lib/health");
const { isServerFault } = await import("../src/lib/request-errors");

describe("health check", () => {
	test("passes when the migrated database can be read", async () => {
		const res = await statusResponse();
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("OK");
		expect(res.headers.get("cache-control")).toBe("no-store");
	});

	test("fails without revealing why when the database can't be read", async () => {
		const output = spyOn(console, "log").mockImplementation(() => {});
		try {
			const res = await statusResponse(async () => {
				throw new Error("SQLITE_CORRUPT at /secret/path");
			});
			expect(res.status).toBe(503);
			expect(await res.text()).toBe("Database unavailable");
			expect(res.headers.get("cache-control")).toBe("no-store");
		} finally {
			output.mockRestore();
		}
	});
});

describe("which request errors get logged", () => {
	test("skips errors that are the app working normally", () => {
		for (const code of ["UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "CONFLICT"]) {
			expect(isServerFault(new ORPCError(code))).toBe(false);
		}
	});

	test("logs real failures", () => {
		expect(isServerFault(new Error("disk full"))).toBe(true);
		expect(isServerFault(new ORPCError("INTERNAL_SERVER_ERROR"))).toBe(true);
	});
});
