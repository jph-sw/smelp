import { describe, expect, test } from "bun:test";
import { nextCycle } from "./next-cycle";

const cycle = (name: string, startDate: string, endDate: string) => ({
	name,
	startDate,
	endDate,
});

describe("nextCycle", () => {
	test("follows a two-week Mon–Fri sprint with the next two weeks, Mon–Fri", () => {
		expect(nextCycle([cycle("Sprint 1", "2026-11-02", "2026-11-13")])).toEqual({
			name: "Sprint 2",
			startDate: "2026-11-16",
			endDate: "2026-11-27",
			goal: "",
		});
	});

	test("starts the day after a cycle that runs Mon–Sun", () => {
		const next = nextCycle([cycle("Week 3", "2026-11-02", "2026-11-08")]);
		expect(next?.startDate).toBe("2026-11-09");
		expect(next?.endDate).toBe("2026-11-15");
	});

	test("follows the cycle that ends last, whatever the order", () => {
		const next = nextCycle([
			cycle("Sprint 5", "2026-11-16", "2026-11-27"),
			cycle("Sprint 3", "2026-10-19", "2026-10-30"),
			cycle("Sprint 4", "2026-11-02", "2026-11-13"),
		]);
		expect(next?.name).toBe("Sprint 6");
		expect(next?.startDate).toBe("2026-11-30");
	});

	test("counts the name on, keeping its zero padding", () => {
		const name = (from: string) =>
			nextCycle([cycle(from, "2026-11-02", "2026-11-13")])?.name;
		expect(name("Sprint 13")).toBe("Sprint 14");
		expect(name("S09")).toBe("S10");
		expect(name("S99")).toBe("S100");
		expect(name("Kickoff")).toBe("Kickoff 2");
		expect(name("x".repeat(64))).toHaveLength(64);
	});

	test("has nothing to follow without cycles", () => {
		expect(nextCycle([])).toBeNull();
	});

	test("rolls over months and years", () => {
		expect(
			nextCycle([cycle("Sprint 26", "2026-12-14", "2026-12-25")]),
		).toMatchObject({ startDate: "2026-12-28", endDate: "2027-01-08" });
		expect(
			nextCycle([cycle("Sprint 4", "2027-02-15", "2027-02-26")]),
		).toMatchObject({ startDate: "2027-03-01", endDate: "2027-03-12" });
	});
});
