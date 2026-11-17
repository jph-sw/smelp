import { describe, expect, test } from "bun:test";
import {
	isFiltered,
	matchesFilters,
	parseBoardFilters,
	UNASSIGNED,
} from "./board-filters";
import type { IssuePriority } from "./issue-priorities";
import type { IssueType } from "./issue-types";

const issue = (
	id: string,
	fields: Partial<{
		title: string;
		assignee: string | null;
		state: string;
		type: IssueType;
		priority: IssuePriority;
		cycleId: string | null;
		moduleId: string | null;
		dueDate: string | null;
	}> = {},
) => ({
	id,
	title: `Work item ${id}`,
	assignee: null,
	state: "todo",
	type: "task" as IssueType,
	priority: "none" as IssuePriority,
	cycleId: null,
	moduleId: null,
	dueDate: null,
	...fields,
});

const issues = [
	issue("WEB-1", { assignee: "ana", title: "Fix login", priority: "high" }),
	issue("WEB-2", { assignee: "ben", state: "done", priority: "urgent" }),
	issue("WEB-3", { assignee: "cleo", type: "bug", priority: "high" }),
	issue("WEB-4", { type: "bug" }),
	issue("WEB-5", { assignee: "ana", moduleId: "mod-1" }),
];

const TODAY = "2026-11-17";
const states = [
	{ id: "todo", group: "unstared" },
	{ id: "doing", group: "started" },
	{ id: "done", group: "completed" },
	{ id: "dropped", group: "cancelled" },
];

const shown = (search: Record<string, unknown>, items = issues) => {
	const filters = parseBoardFilters(search);
	return items
		.filter((item) => matchesFilters(item, filters, { today: TODAY, states }))
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

	test("shows only items of the chosen type", () => {
		expect(shown({ type: "bug" })).toEqual(["WEB-3", "WEB-4"]);
		expect(shown({ type: "bug", assignee: ["cleo"] })).toEqual(["WEB-3"]);
		expect(isFiltered(parseBoardFilters({ type: "bug" }))).toBe(true);
	});

	test("ignores a type that isn't one of the known ones", () => {
		expect(parseBoardFilters({ type: "Bug" }).type).toBeUndefined();
		expect(parseBoardFilters({ type: ["bug"] }).type).toBeUndefined();
		expect(shown({ type: "incident" })).toHaveLength(issues.length);
	});

	test("shows only items of the chosen priority", () => {
		expect(shown({ priority: "high" })).toEqual(["WEB-1", "WEB-3"]);
		expect(shown({ priority: "high", type: "bug" })).toEqual(["WEB-3"]);
		expect(shown({ priority: "none" })).toEqual(["WEB-4", "WEB-5"]);
		expect(isFiltered(parseBoardFilters({ priority: "high" }))).toBe(true);
	});

	test("ignores a priority that isn't one of the known ones", () => {
		expect(parseBoardFilters({ priority: "High" }).priority).toBeUndefined();
		expect(parseBoardFilters({ priority: ["high"] }).priority).toBeUndefined();
		expect(shown({ priority: "blocker" })).toHaveLength(issues.length);
	});

	test("searches title and id without regard to case", () => {
		expect(shown({ q: "FIX LOG" })).toEqual(["WEB-1"]);
		expect(shown({ q: "web-3" })).toEqual(["WEB-3"]);
		expect(isFiltered(parseBoardFilters({ q: "web-3" }))).toBe(true);
	});
});

describe("due date filters", () => {
	const dated = [
		issue("DUE-1", { state: "doing", dueDate: "2026-11-16" }),
		issue("DUE-2", { state: "done", dueDate: "2026-11-16" }),
		issue("DUE-3", { state: "doing", dueDate: TODAY }),
		issue("DUE-4", { state: "doing" }),
		issue("DUE-5", { state: "todo", dueDate: "2026-11-23" }),
		issue("DUE-6", { state: "todo", dueDate: "2026-11-24" }),
		issue("DUE-7", { state: "dropped", dueDate: "2026-11-01" }),
		issue("DUE-8", { state: "dropped", dueDate: "2026-11-20" }),
		issue("DUE-9", { state: "todo", dueDate: "2025-12-31" }),
	];

	test("overdue shows unfinished items whose day has passed", () => {
		expect(shown({ due: "overdue" }, dated)).toEqual(["DUE-1", "DUE-9"]);
		expect(isFiltered(parseBoardFilters({ due: "overdue" }))).toBe(true);
	});

	test("this week shows unfinished items due today through six days from now", () => {
		expect(shown({ due: "week" }, dated)).toEqual(["DUE-3", "DUE-5"]);
	});

	test("ignores a due filter it doesn't know", () => {
		expect(parseBoardFilters({ due: "soon" }).due).toBeUndefined();
		expect(shown({ due: "soon" }, dated)).toHaveLength(dated.length);
	});
});
