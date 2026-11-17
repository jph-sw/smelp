import { describe, expect, test } from "bun:test";

await import("./setup");
const { Auth } = await import("@smelp/auth");

const auth = new Auth();
const bytes = (...values: number[]) => new Uint8Array(values);

describe("generateRandomId", () => {
	test("is 16 characters from the unambiguous alphabet", () => {
		for (let n = 0; n < 200; n++) {
			expect(auth.generateRandomId()).toMatch(
				/^[abcdefghijkmnpqrstuvwxyz23456789]{16}$/,
			);
		}
	});

	test("does not repeat", () => {
		const ids = new Set(
			Array.from({ length: 1000 }, () => auth.generateRandomId()),
		);
		expect(ids.size).toBe(1000);
	});
});

describe("constantTimeEqual", () => {
	test("matches equal bytes", () => {
		expect(auth.constantTimeEqual(bytes(1, 2, 3), bytes(1, 2, 3))).toBe(true);
		expect(auth.constantTimeEqual(bytes(), bytes())).toBe(true);
	});

	test("rejects different bytes or lengths", () => {
		expect(auth.constantTimeEqual(bytes(1, 2, 3), bytes(1, 2, 4))).toBe(false);
		expect(auth.constantTimeEqual(bytes(1, 2), bytes(1, 2, 3))).toBe(false);
		expect(auth.constantTimeEqual(bytes(255), bytes(0))).toBe(false);
	});
});
