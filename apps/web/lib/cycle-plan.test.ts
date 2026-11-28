import { describe, expect, test } from "bun:test";
import type { tables } from "@smelp/db";
import { planCycle } from "./cycle-plan";

const states = [
	{ id: "todo", group: "unstarted" },
	{ id: "doing", group: "started" },
	{ id: "done", group: "completed" },
	{ id: "dropped", group: "cancelled" },
] as Pick<tables["state"], "id" | "group">[];

const issue = (
	id: string,
	state: string,
	cycleId: string | null,
	estimate: number | null,
) => ({ id, state, cycleId, estimate });

describe("planCycle", () => {
	test("splits open unplanned items from the cycle's items, keeping order", () => {
		const plan = planCycle(
			[
				issue("A-3", "todo", null, 1),
				issue("A-1", "doing", "c1", 2),
				issue("A-2", "doing", null, null),
				issue("A-4", "todo", "c1", null),
			],
			states,
			"c1",
		);
		expect(plan.backlog.map((i) => i.id)).toEqual(["A-3", "A-2"]);
		expect(plan.planned.map((i) => i.id)).toEqual(["A-1", "A-4"]);
	});

	test("leaves finished items and other cycles' items out of the backlog", () => {
		const plan = planCycle(
			[
				issue("A-1", "done", null, 1),
				issue("A-2", "dropped", null, 1),
				issue("A-3", "todo", "c2", 1),
			],
			states,
			"c1",
		);
		expect(plan.backlog).toEqual([]);
		expect(plan.planned).toEqual([]);
	});

	test("totals the planned estimates and counts the unestimated", () => {
		const plan = planCycle(
			[
				issue("A-1", "todo", "c1", 3),
				issue("A-2", "done", "c1", 0.1),
				issue("A-3", "doing", "c1", 0.2),
				issue("A-4", "todo", "c1", null),
				issue("A-5", "todo", null, 8),
			],
			states,
			"c1",
		);
		expect(plan.points).toBeCloseTo(3.3);
		expect(plan.unestimated).toBe(1);
	});

	test("lists cancelled items in the cycle without counting them", () => {
		const plan = planCycle(
			[issue("A-1", "dropped", "c1", 5), issue("A-2", "dropped", "c1", null)],
			states,
			"c1",
		);
		expect(plan.planned.map((i) => i.id)).toEqual(["A-1", "A-2"]);
		expect(plan.points).toBe(0);
		expect(plan.unestimated).toBe(0);
	});
});
