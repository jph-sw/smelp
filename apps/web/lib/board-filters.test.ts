import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	CURRENT_CYCLE,
	isFiltered,
	matchesFilters,
	parseBoardFilters,
	parseBoardSearch,
	recallBoardSearch,
	rememberBoardSearch,
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
		labelIds: string[];
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
	labelIds: [] as string[],
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

const shown = (
	search: Record<string, unknown>,
	items = issues,
	currentCycleId: string | null = null,
) => {
	const filters = parseBoardFilters(search);
	return items
		.filter((item) =>
			matchesFilters(item, filters, { today: TODAY, states, currentCycleId }),
		)
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

describe("label filter", () => {
	const labelled = [
		issue("LAB-1", { labelIds: ["frontend"] }),
		issue("LAB-2", { labelIds: ["frontend", "customer"] }),
		issue("LAB-3", { labelIds: ["customer"] }),
		issue("LAB-4"),
	];

	test("shows every item, labelled or not, without a label filter", () => {
		expect(shown({}, labelled)).toEqual(["LAB-1", "LAB-2", "LAB-3", "LAB-4"]);
		expect(isFiltered(parseBoardFilters({}))).toBe(false);
	});

	test("shows the items that carry the chosen label", () => {
		expect(shown({ label: ["frontend"] }, labelled)).toEqual([
			"LAB-1",
			"LAB-2",
		]);
		expect(isFiltered(parseBoardFilters({ label: ["frontend"] }))).toBe(true);
	});

	test("shows items that carry any of several chosen labels", () => {
		expect(shown({ label: ["frontend", "customer"] }, labelled)).toEqual([
			"LAB-1",
			"LAB-2",
			"LAB-3",
		]);
	});

	test("hides items without labels once a label is chosen", () => {
		expect(shown({ label: ["customer"] }, labelled)).toEqual([
			"LAB-2",
			"LAB-3",
		]);
		expect(shown({ label: ["deleted-label"] }, labelled)).toEqual([]);
	});

	test("combines with the other filters", () => {
		const mixed = [
			issue("MIX-1", { labelIds: ["frontend"], type: "bug" }),
			issue("MIX-2", { labelIds: ["frontend"] }),
		];
		expect(shown({ label: ["frontend"], type: "bug" }, mixed)).toEqual([
			"MIX-1",
		]);
	});

	test("an older link without a label shows everything", () => {
		expect(parseBoardFilters({ assignee: "ana" }).label).toBeUndefined();
		expect(shown({ type: "task" }, labelled)).toHaveLength(labelled.length);
	});

	test("reads a single label or a list, dropping empty entries and repeats", () => {
		expect(parseBoardFilters({ label: "frontend" }).label).toEqual([
			"frontend",
		]);
		expect(
			parseBoardFilters({ label: ["frontend", "", "frontend", "customer"] })
				.label,
		).toEqual(["frontend", "customer"]);
		expect(parseBoardFilters({ label: [] }).label).toBeUndefined();
	});
});

describe("current cycle filter", () => {
	const sprints = [
		issue("SPR-1", { cycleId: "sprint-1" }),
		issue("SPR-2", { cycleId: "sprint-2" }),
		issue("SPR-3", { cycleId: "sprint-2", type: "bug" }),
		issue("SPR-4"),
	];
	const bookmark = { cycle: "current" };

	test("shows only the items of the cycle running now", () => {
		expect(shown(bookmark, sprints, "sprint-1")).toEqual(["SPR-1"]);
	});

	test("the same link follows the next cycle once it starts", () => {
		expect(shown(bookmark, sprints, "sprint-2")).toEqual(["SPR-2", "SPR-3"]);
	});

	test("shows nothing while no cycle is running", () => {
		expect(shown(bookmark, sprints, null)).toEqual([]);
	});

	test("combines with the other filters", () => {
		expect(shown({ ...bookmark, type: "bug" }, sprints, "sprint-2")).toEqual([
			"SPR-3",
		]);
	});

	test("a chosen cycle and No cycle ignore which cycle is running", () => {
		expect(shown({ cycle: "sprint-1" }, sprints, "sprint-2")).toEqual([
			"SPR-1",
		]);
		expect(shown({ cycle: "none" }, sprints, "sprint-2")).toEqual(["SPR-4"]);
	});

	test("survives the URL and counts as a filter", () => {
		expect(parseBoardFilters(bookmark).cycle).toBe(CURRENT_CYCLE);
		expect(isFiltered(parseBoardFilters(bookmark))).toBe(true);
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

describe("parseBoardSearch", () => {
	test("keeps a valid list sort in either direction", () => {
		expect(parseBoardSearch({ sort: "due" }).sort).toBe("due");
		expect(parseBoardSearch({ sort: "-priority" }).sort).toBe("-priority");
	});

	test("drops a sort it doesn't know", () => {
		expect(parseBoardSearch({ sort: "updatedAt" }).sort).toBeUndefined();
		expect(parseBoardSearch({ sort: ["due"] }).sort).toBeUndefined();
	});

	test("the sort isn't a filter", () => {
		expect(parseBoardFilters({ sort: "due" })).not.toHaveProperty("sort");
		expect(isFiltered(parseBoardSearch({ sort: "due" }))).toBe(false);
	});
});

describe("remembered board search", () => {
	const stored = new Map<string, string>();
	const original = globalThis.sessionStorage;

	beforeEach(() => {
		stored.clear();
		globalThis.sessionStorage = {
			getItem: (key: string) => stored.get(key) ?? null,
			setItem: (key: string, value: string) => stored.set(key, value),
		} as unknown as Storage;
	});

	afterEach(() => {
		globalThis.sessionStorage = original;
	});

	const recalled = (projectId: string) =>
		JSON.parse(JSON.stringify(recallBoardSearch(projectId)));

	test("restores the filters and the view", () => {
		rememberBoardSearch("ABC", { assignee: ["ana"], view: "list" });
		expect(recalled("ABC")).toEqual({ assignee: ["ana"], view: "list" });
	});

	test("restores the list sort", () => {
		rememberBoardSearch("ABC", { view: "list", sort: "-due" });
		expect(recalled("ABC")).toEqual({ view: "list", sort: "-due" });
	});

	test("forgets a stored sort it doesn't know", () => {
		stored.set("smelp.board-search.ABC", '{"view":"list","sort":"nope"}');
		expect(recalled("ABC")).toEqual({ view: "list" });
	});

	test("keeps each project's search apart", () => {
		rememberBoardSearch("ABC", { type: "bug" });
		expect(recalled("XYZ")).toEqual({});
	});

	test("the latest search replaces the earlier one", () => {
		rememberBoardSearch("ABC", { type: "bug" });
		rememberBoardSearch("ABC", {});
		expect(recalled("ABC")).toEqual({});
	});

	test("ignores stored values it can't read", () => {
		stored.set("smelp.board-search.ABC", "not json");
		expect(recalled("ABC")).toEqual({});
		stored.set("smelp.board-search.ABC", "null");
		expect(recalled("ABC")).toEqual({});
		stored.set("smelp.board-search.ABC", '{"view":"grid","type":"nope"}');
		expect(recalled("ABC")).toEqual({});
	});

	test("works without browser storage", () => {
		globalThis.sessionStorage = undefined as unknown as Storage;
		expect(() => rememberBoardSearch("ABC", { type: "bug" })).not.toThrow();
		expect(recalled("ABC")).toEqual({});
	});
});
