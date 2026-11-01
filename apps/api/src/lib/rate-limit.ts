import { ORPCError } from "@orpc/server";

const MAX_TRACKED_KEYS = 10_000;

// Counts attempts in memory, so limits reset on restart and apply per process.
// That suits the current single-server SQLite setup.
export class RateLimiter {
	private attempts = new Map<string, { count: number; resetAt: number }>();

	constructor(
		private readonly max: number,
		private readonly windowMs: number,
	) {}

	consume(key: string, now = Date.now()) {
		let entry = this.attempts.get(key);
		if (!entry || entry.resetAt <= now) {
			if (this.attempts.size >= MAX_TRACKED_KEYS) this.prune(now);
			entry = { count: 0, resetAt: now + this.windowMs };
			this.attempts.set(key, entry);
		}

		entry.count += 1;
		return {
			allowed: entry.count <= this.max,
			retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000),
		};
	}

	reset(key: string) {
		this.attempts.delete(key);
	}

	private prune(now: number) {
		for (const [key, entry] of this.attempts) {
			if (entry.resetAt <= now) this.attempts.delete(key);
		}
		// Everything is still active: drop the oldest entries to stay bounded.
		for (const key of this.attempts.keys()) {
			if (this.attempts.size < MAX_TRACKED_KEYS) break;
			this.attempts.delete(key);
		}
	}
}

export function enforceRateLimit(limiter: RateLimiter, key: string) {
	const { allowed, retryAfterSeconds } = limiter.consume(key);
	if (allowed) return;

	const minutes = Math.ceil(retryAfterSeconds / 60);
	throw new ORPCError("TOO_MANY_REQUESTS", {
		message: `Too many attempts. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`,
		data: { retryAfterSeconds },
	});
}
