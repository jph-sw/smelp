import { expect, test } from "bun:test";

const { RateLimiter } = await import("../src/lib/rate-limit");

test("allows attempts up to the limit, then blocks", () => {
	const limiter = new RateLimiter(2, 1000);
	expect(limiter.consume("a", 0).allowed).toBe(true);
	expect(limiter.consume("a", 0).allowed).toBe(true);
	expect(limiter.consume("a", 0).allowed).toBe(false);
	expect(limiter.consume("b", 0).allowed).toBe(true);
});

test("allows attempts again after the window", () => {
	const limiter = new RateLimiter(1, 1000);
	limiter.consume("a", 0);
	expect(limiter.consume("a", 500)).toEqual({
		allowed: false,
		retryAfterSeconds: 1,
	});
	expect(limiter.consume("a", 1000).allowed).toBe(true);
});

test("reset clears a key", () => {
	const limiter = new RateLimiter(1, 1000);
	limiter.consume("a", 0);
	limiter.reset("a");
	expect(limiter.consume("a", 0).allowed).toBe(true);
});
