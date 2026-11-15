import { describe, expect, test } from "bun:test";
import {
	isFiltered,
	matchesFilters,
	parseBoardFilters,
	UNASSIGNED,
} from "./board-filters";

const issue = (
	id: string,
	fields: Partial<{
		title: string;
		assignee: string | null;
		state: string;
		cycleId: string | null;
		moduleId: string | null;
	}> = {},
) => ({
	id,
	title: `Work item ${id}`,
	assignee: null,
	state: "todo",
	cycleId: null,
	moduleId: null,
	...fields,
});

const issues = [
	issue("WEB-1", { assignee: "ana", title: "Fix login" }),
	issue("WEB-2", { assignee: "ben", state: "done" }),
	issue("WEB-3", { assignee: "cleo" }),
	issue("WEB-4"),
	issue("WEB-5", { assignee: "ana", moduleId: "mod-1" }),
];

const shown = (search: Record<string, unknown>) => {
	const filters = parseBoardFilters(search);
	return issues
		.filter((item) => matchesFilters(item, filters))
		.map((item) => item.id);
};

describe("parseBoardFilters", () => {
	test("keeps a legacy single assignee link working", () => {
		expect(parseBoardFilters({ assignee: "ana" }).assignee).toEqual(["ana"]);
		expect(shown({ assignee: "ana" })).toEqual(["WEB-1", "WEB-5"]);
	});

	test("reads a list of assignees, dropping empty entries and repeats", () => {
		expect(
			parseBoardFilters({ assignee: ["ana", "", 7, null, "ana", UNASSIGNED] })
				.assignee,
		).toEqual(["ana", "7", UNASSIGNED]);
	});

	test("treats a missing or empty assignee list as no filter", () => {
		expect(parseBoardFilters({}).assignee).toBeUndefined();
		expect(parseBoardFilters({ assignee: [] }).assignee).toBeUndefined();
		expect(parseBoardFilters({ assignee: [""] }).assignee).toBeUndefined();
		expect(isFiltered(parseBoardFilters({ assignee: [] }))).toBe(false);
	});
});

describe("matchesFilters", () => {
	test("shows every item without filters", () => {
		expect(shown({})).toHaveLength(issues.length);
		expect(isFiltered(parseBoardFilters({}))).toBe(false);
	});

	test("shows items of any chosen assignee", () => {
		expect(shown({ assignee: ["ana", "ben"] })).toEqual([
			"WEB-1",
			"WEB-2",
			"WEB-5",
		]);
	});

	test("adds unassigned items when Unassigned is chosen", () => {
		expect(shown({ assignee: [UNASSIGNED] })).toEqual(["WEB-4"]);
		expect(shown({ assignee: ["cleo", UNASSIGNED] })).toEqual([
			"WEB-3",
			"WEB-4",
		]);
	});

	test("combines assignees with the other filters", () => {
		expect(shown({ assignee: ["ana", "ben"], state: "todo" })).toEqual([
			"WEB-1",
			"WEB-5",
		]);
		expect(shown({ assignee: ["ana", "ben"], module: "mod-1" })).toEqual([
			"WEB-5",
		]);
		expect(shown({ assignee: ["ana"], module: "none" })).toEqual(["WEB-1"]);
		expect(shown({ assignee: ["ana"], q: "login" })).toEqual(["WEB-1"]);
	});

	test("searches title and id without regard to case", () => {
		expect(shown({ q: "FIX LOG" })).toEqual(["WEB-1"]);
		expect(shown({ q: "web-3" })).toEqual(["WEB-3"]);
		expect(isFiltered(parseBoardFilters({ q: "web-3" }))).toBe(true);
	});
});
