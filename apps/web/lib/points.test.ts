import { describe, expect, test } from "bun:test";
import { formatPoints, formatShortPoints } from "./points";

describe("points", () => {
	test("one point is singular", () => {
		expect(formatPoints(1)).toBe("1 point");
		expect(formatShortPoints(1)).toBe("1 pt");
	});

	test("anything else is plural", () => {
		expect(formatPoints(0)).toBe("0 points");
		expect(formatPoints(0.5)).toBe("0.5 points");
		expect(formatShortPoints(16)).toBe("16 pts");
	});

	test("sums of decimals don't show float noise", () => {
		expect(formatPoints(0.1 + 0.2)).toBe("0.3 points");
	});
});
