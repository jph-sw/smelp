import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readCollapsedStates, writeCollapsedStates } from "./collapsed-states";

describe("collapsed board columns", () => {
	const stored = new Map<string, string>();
	const original = globalThis.localStorage;

	beforeEach(() => {
		stored.clear();
		globalThis.localStorage = {
			getItem: (key: string) => stored.get(key) ?? null,
			setItem: (key: string, value: string) => stored.set(key, value),
		} as unknown as Storage;
	});

	afterEach(() => {
		globalThis.localStorage = original;
	});

	const collapsed = (userId: string | undefined, projectId: string) => [
		...readCollapsedStates(userId, projectId),
	];

	test("nothing is collapsed to begin with", () => {
		expect(collapsed("ann", "project-1")).toEqual([]);
	});

	test("restores the saved choice", () => {
		writeCollapsedStates("ann", "project-1", new Set(["done", "backlog"]));
		expect(collapsed("ann", "project-1")).toEqual(["done", "backlog"]);
	});

	test("the latest choice replaces the earlier one", () => {
		writeCollapsedStates("ann", "project-1", new Set(["done"]));
		writeCollapsedStates("ann", "project-1", new Set());
		expect(collapsed("ann", "project-1")).toEqual([]);
	});

	test("keeps a choice for each project", () => {
		writeCollapsedStates("ann", "project-1", new Set(["done"]));
		expect(collapsed("ann", "project-2")).toEqual([]);
	});

	test("keeps a choice for each person", () => {
		writeCollapsedStates("ann", "project-1", new Set(["done"]));
		expect(collapsed("bob", "project-1")).toEqual([]);
		expect(collapsed(undefined, "project-1")).toEqual([]);
	});

	test("a signed-out viewer's choice is remembered", () => {
		writeCollapsedStates(undefined, "project-1", new Set(["done"]));
		expect(collapsed(undefined, "project-1")).toEqual(["done"]);
	});

	test.each(["not json", "{}", '"done"', "null", "3"])(
		"stored value %j counts as nothing collapsed",
		(value) => {
			stored.set("smelp.collapsed-states.ann.project-1", value);
			expect(collapsed("ann", "project-1")).toEqual([]);
		},
	);

	test("ignores entries that aren't state ids", () => {
		stored.set(
			"smelp.collapsed-states.ann.project-1",
			JSON.stringify(["done", 1, null, { id: "x" }]),
		);
		expect(collapsed("ann", "project-1")).toEqual(["done"]);
	});

	test("unusable storage behaves as nothing collapsed and never throws", () => {
		const fail = () => {
			throw new Error("storage is unavailable");
		};
		globalThis.localStorage = {
			getItem: fail,
			setItem: fail,
		} as unknown as Storage;

		writeCollapsedStates("ann", "project-1", new Set(["done"]));
		expect(collapsed("ann", "project-1")).toEqual([]);
	});
});
