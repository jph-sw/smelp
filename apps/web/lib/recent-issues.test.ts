import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readRecentIssues, recordRecentIssue } from "./recent-issues";

describe("recently opened work items", () => {
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

	test("nothing is recent to begin with", () => {
		expect(readRecentIssues("ann", "team")).toEqual([]);
	});

	test("lists the newest first", () => {
		recordRecentIssue("ann", "team", "WEB-1");
		recordRecentIssue("ann", "team", "WEB-2");
		expect(readRecentIssues("ann", "team")).toEqual(["WEB-2", "WEB-1"]);
	});

	test("opening an item again moves it to the front", () => {
		recordRecentIssue("ann", "team", "WEB-1");
		recordRecentIssue("ann", "team", "WEB-2");
		recordRecentIssue("ann", "team", "WEB-1");
		expect(readRecentIssues("ann", "team")).toEqual(["WEB-1", "WEB-2"]);
	});

	test("keeps the last ten", () => {
		for (let i = 1; i <= 12; i++) recordRecentIssue("ann", "team", `WEB-${i}`);
		const recent = readRecentIssues("ann", "team");
		expect(recent).toHaveLength(10);
		expect(recent[0]).toBe("WEB-12");
		expect(recent).not.toContain("WEB-2");
	});

	test("keeps a list for each workspace and person", () => {
		recordRecentIssue("ann", "team", "WEB-1");
		expect(readRecentIssues("ann", "other")).toEqual([]);
		expect(readRecentIssues("bob", "team")).toEqual([]);
	});

	test.each(["not json", "{}", '"WEB-1"', "null", "3"])(
		"stored value %j counts as nothing recent",
		(value) => {
			stored.set("smelp.recent-issues.ann.team", value);
			expect(readRecentIssues("ann", "team")).toEqual([]);
		},
	);

	test("ignores entries that aren't ids", () => {
		stored.set(
			"smelp.recent-issues.ann.team",
			JSON.stringify(["WEB-1", 1, null, { id: "x" }]),
		);
		expect(readRecentIssues("ann", "team")).toEqual(["WEB-1"]);
	});

	test("unusable storage counts as nothing recent and never throws", () => {
		const fail = () => {
			throw new Error("storage is unavailable");
		};
		globalThis.localStorage = {
			getItem: fail,
			setItem: fail,
		} as unknown as Storage;

		recordRecentIssue("ann", "team", "WEB-1");
		expect(readRecentIssues("ann", "team")).toEqual([]);
	});
});
