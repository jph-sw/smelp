import { describe, expect, test } from "bun:test";
import {
	type Columns,
	columnsOf,
	moveCard,
	placementIn,
	provisionalRank,
} from "./rank";

const board: Columns = { todo: ["A", "B", "C"], done: ["D"], empty: [] };

describe("moveCard", () => {
	test("down a column, onto a card, takes that card's place", () => {
		expect(moveCard(board, "A", "C").todo).toEqual(["B", "C", "A"]);
		expect(moveCard(board, "C", "A").todo).toEqual(["C", "A", "B"]);
	});

	test("onto a card in another column goes above it", () => {
		const moved = moveCard(board, "B", "D");
		expect(moved.todo).toEqual(["A", "C"]);
		expect(moved.done).toEqual(["B", "D"]);
	});

	test("onto a column's empty space goes to its bottom, and its own column stays", () => {
		expect(moveCard(board, "A", "done").done).toEqual(["D", "A"]);
		expect(moveCard(board, "A", "empty").empty).toEqual(["A"]);
		expect(moveCard(board, "A", "todo")).toBe(board);
		expect(moveCard(board, "A", "A")).toBe(board);
	});
});

describe("placementIn", () => {
	test("is below the card above, or above the card below at the top", () => {
		expect(placementIn(board, "B")?.placement).toEqual({ after: "A" });
		expect(placementIn(board, "A")?.placement).toEqual({ before: "B" });
		expect(placementIn(board, "D")).toEqual({
			stateId: "done",
			index: 0,
			placement: null,
		});
	});
});

describe("columnsOf", () => {
	test("orders each state's cards by rank, then key", () => {
		const items = [
			{ id: "X-2", rank: "a1", state: "todo" },
			{ id: "X-1", rank: "a1", state: "todo" },
			{ id: "X-3", rank: "a0", state: "done" },
			{ id: "X-4", rank: "Zz", state: "todo" },
		];
		expect(columnsOf(items, ["todo", "done"])).toEqual({
			todo: ["X-4", "X-1", "X-2"],
			done: ["X-3"],
		});
	});
});

describe("provisionalRank", () => {
	const items = [
		{ id: "A", rank: "a0" },
		{ id: "B", rank: "a1" },
		{ id: "C", rank: "a2" },
	];

	test("sorts between the anchor and its neighbour", () => {
		const rank = provisionalRank(items, "C", { after: "A" }) as string;
		expect(rank > "a0" && rank < "a1").toBe(true);
		const top = provisionalRank(items, "C", { before: "A" }) as string;
		expect(top < "a0").toBe(true);
	});
});
