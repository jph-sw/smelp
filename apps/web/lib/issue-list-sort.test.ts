import { describe, expect, test } from "bun:test";
import {
	isListSort,
	type ListSort,
	listSortAria,
	nextListSort,
	sortIssues,
} from "./issue-list-sort";
import type { IssuePriority } from "./issue-priorities";

const issue = (
	id: string,
	fields: Partial<{
		title: string;
		state: string;
		assignee: string | null;
		priority: IssuePriority;
		dueDate: string | null;
		updatedAt: number;
	}> = {},
) => ({
	id,
	title: `Work item ${id}`,
	state: "todo",
	assignee: null,
	priority: "none" as IssuePriority,
	dueDate: null,
	updatedAt: 0,
	...fields,
});

const context = {
	states: [{ id: "todo" }, { id: "doing" }, { id: "done" }],
	members: [
		{ userId: "u-ana", displayName: "Ana" },
		{ userId: "u-ben", displayName: "ben" },
		{ userId: "u-cleo", displayName: "Cleo" },
	],
};

const sortedIds = (issues: ReturnType<typeof issue>[], sort?: ListSort) =>
	sortIssues(issues, sort, context).map((item) => item.id);

describe("sortIssues", () => {
	test("due runs soonest first, then latest first, with undated items last both ways", () => {
		const issues = [
			issue("A"),
			issue("B", { dueDate: "2026-12-01" }),
			issue("C", { dueDate: "2025-01-31" }),
			issue("D", { dueDate: "2026-02-10" }),
		];
		expect(sortedIds(issues, "due")).toEqual(["C", "D", "B", "A"]);
		expect(sortedIds(issues, "-due")).toEqual(["B", "D", "C", "A"]);
	});

	test("a due date that isn't a real day still orders, and a malformed one counts as none", () => {
		const issues = [
			issue("A", { dueDate: "soon" }),
			issue("B", { dueDate: "2026-13-45" }),
			issue("C", { dueDate: "2026-12-31" }),
		];
		expect(sortedIds(issues, "due")).toEqual(["C", "B", "A"]);
		expect(sortedIds(issues, "-due")).toEqual(["B", "C", "A"]);
	});

	test("priority follows severity in both directions", () => {
		const issues = [
			issue("A", { priority: "medium" }),
			issue("B", { priority: "urgent" }),
			issue("C", { priority: "none" }),
			issue("D", { priority: "low" }),
			issue("E", { priority: "high" }),
		];
		expect(sortedIds(issues, "-priority")).toEqual(["B", "E", "A", "D", "C"]);
		expect(sortedIds(issues, "priority")).toEqual(["C", "D", "A", "E", "B"]);
	});

	test("keys run in natural order", () => {
		const issues = [issue("VER-10"), issue("VER-2"), issue("VER-1")];
		expect(sortedIds(issues, "key")).toEqual(["VER-1", "VER-2", "VER-10"]);
		expect(sortedIds(issues, "-key")).toEqual(["VER-10", "VER-2", "VER-1"]);
	});

	test("titles ignore case and read numbers naturally", () => {
		const issues = [
			issue("A", { title: "banana" }),
			issue("B", { title: "Step 10" }),
			issue("C", { title: "Apple" }),
			issue("D", { title: "Step 2" }),
		];
		expect(sortedIds(issues, "title")).toEqual(["C", "A", "D", "B"]);
	});

	test("assignees sort by name with unassigned and unknown people last both ways", () => {
		const issues = [
			issue("A"),
			issue("B", { assignee: "u-cleo" }),
			issue("C", { assignee: "u-gone" }),
			issue("D", { assignee: "u-ana" }),
			issue("E", { assignee: "u-ben" }),
		];
		expect(sortedIds(issues, "assignee")).toEqual(["D", "E", "B", "A", "C"]);
		expect(sortedIds(issues, "-assignee")).toEqual(["B", "E", "D", "A", "C"]);
	});

	test("state follows the board's column order, not the names", () => {
		const issues = [
			issue("A", { state: "done" }),
			issue("B", { state: "todo" }),
			issue("C", { state: "doing" }),
		];
		expect(sortedIds(issues, "state")).toEqual(["B", "C", "A"]);
		expect(sortedIds(issues, "-state")).toEqual(["A", "C", "B"]);
	});

	test("ties keep the default order in both directions", () => {
		const dueDate = "2026-11-20";
		const issues = [
			issue("OLD", { dueDate, updatedAt: 1 }),
			issue("LATER-COLUMN", { dueDate, state: "done", updatedAt: 9 }),
			issue("NEW", { dueDate, updatedAt: 5 }),
		];
		const expected = ["NEW", "OLD", "LATER-COLUMN"];
		expect(sortedIds(issues, "due")).toEqual(expected);
		expect(sortedIds(issues, "-due")).toEqual(expected);
	});

	test("items without a value keep the default order too", () => {
		const issues = [
			issue("OLD", { updatedAt: 1 }),
			issue("NEW", { updatedAt: 5 }),
			issue("DATED", { dueDate: "2026-11-20" }),
		];
		expect(sortedIds(issues, "-due")).toEqual(["DATED", "NEW", "OLD"]);
	});

	test("without a sort, items follow column order and then newest update", () => {
		const issues = [
			issue("A", { state: "done", updatedAt: 9 }),
			issue("B", { updatedAt: 1 }),
			issue("C", { state: "doing", updatedAt: 3 }),
			issue("D", { updatedAt: 2 }),
		];
		expect(sortedIds(issues)).toEqual(["D", "B", "C", "A"]);
	});

	test("drops items whose state isn't shown and leaves the input alone", () => {
		const issues = [issue("B"), issue("A", { state: "elsewhere" })];
		expect(sortedIds(issues, "key")).toEqual(["B"]);
		expect(issues.map((item) => item.id)).toEqual(["B", "A"]);
	});
});

describe("nextListSort", () => {
	test("cycles ascending, descending, then back to the default", () => {
		expect(nextListSort(undefined, "due")).toBe("due");
		expect(nextListSort("due", "due")).toBe("-due");
		expect(nextListSort("-due", "due")).toBeUndefined();
	});

	test("priority starts with the most severe", () => {
		expect(nextListSort(undefined, "priority")).toBe("-priority");
		expect(nextListSort("-priority", "priority")).toBe("priority");
		expect(nextListSort("priority", "priority")).toBeUndefined();
	});

	test("moving to another column starts that column over", () => {
		expect(nextListSort("-due", "title")).toBe("title");
		expect(nextListSort("title", "priority")).toBe("-priority");
	});
});

describe("listSortAria", () => {
	test("names the direction on the sorted column only", () => {
		expect(listSortAria("due", "due")).toBe("ascending");
		expect(listSortAria("-due", "due")).toBe("descending");
		expect(listSortAria("-due", "key")).toBe("none");
		expect(listSortAria(undefined, "due")).toBe("none");
	});
});

describe("isListSort", () => {
	test("accepts every column in either direction", () => {
		for (const value of ["key", "-title", "state", "-assignee", "priority"]) {
			expect(isListSort(value)).toBe(true);
		}
		expect(isListSort("-due")).toBe(true);
	});

	test("rejects anything else", () => {
		for (const value of ["", "-", "--due", "Due", "due-", "updatedAt"]) {
			expect(isListSort(value)).toBe(false);
		}
		for (const value of [undefined, null, 1, ["due"], { due: true }]) {
			expect(isListSort(value)).toBe(false);
		}
	});
});
