import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "#/test/dom";
import {
	averageVelocity,
	type Cycle,
	measuredCycles,
	VelocityChart,
} from "./cycle-parts";

const cycle = (
	name: string,
	committed: number,
	completed: number,
	status: Cycle["status"] = "completed",
): Cycle => ({
	id: name,
	projectId: "p1",
	name,
	startDate: "2026-01-01",
	endDate: "2026-01-10",
	goal: null,
	createdBy: null,
	createdAt: 0,
	status,
	progress: {
		total: 0,
		backlog: 0,
		unstarted: 0,
		started: 0,
		completed: 0,
		cancelled: 0,
		points: { total: 0, completed: 0 },
	},
	velocity:
		status === "completed"
			? {
					committed: { items: 1, points: committed },
					completed: { items: 1, points: completed },
				}
			: null,
});

describe("velocity", () => {
	afterEach(cleanup);

	test("averages completed points over the last three measured cycles", () => {
		const measured = measuredCycles([
			cycle("S1", 10, 1),
			cycle("S2", 10, 5),
			cycle("Empty", 0, 0),
			cycle("S3", 10, 6),
			cycle("S4", 10, 6),
			cycle("Next", 0, 0, "upcoming"),
		]);
		expect(measured.map((c) => c.name)).toEqual(["S1", "S2", "S3", "S4"]);
		expect(averageVelocity(measured)).toEqual({ points: 5.7, count: 3 });
		expect(averageVelocity(measured.slice(0, 1))).toEqual({
			points: 1,
			count: 1,
		});
		expect(averageVelocity([])).toBeNull();
	});

	test("the chart names each cycle's result for screen readers", () => {
		const cycles = measuredCycles(
			Array.from({ length: 7 }, (_, i) => cycle(`Sprint ${i + 1}`, 8, i)),
		);
		render(<VelocityChart cycles={cycles} />);
		const items = screen.getAllByRole("listitem").map((li) => li.textContent);
		expect(items).toHaveLength(6);
		expect(items[0]).toBe("Sprint 2: 1 of 8 points completed");
		expect(items[5]).toBe("Sprint 7: 6 of 8 points completed");
		expect(document.body.textContent).toContain(
			"Average of the last 3 cycles: 5 points",
		);
	});

	test("says the last cycle when there is only one", () => {
		render(<VelocityChart cycles={measuredCycles([cycle("Only", 5, 4)])} />);
		expect(document.body.textContent).toContain(
			"Average of the last cycle: 4 points",
		);
	});
});
