import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	arrangeTimeline,
	displayedActivityFilter,
	readActivityView,
} from "./activity-view";

const entry = (
	id: string,
	kind: "comment" | "activity",
	createdAt: number,
) => ({
	id,
	kind,
	createdAt,
});

const entries = [
	entry("edited", "activity", 2),
	entry("first-comment", "comment", 1),
	entry("last-comment", "comment", 4),
	entry("moved", "activity", 3),
];

const ids = (list: { id: string }[]) => list.map((e) => e.id);

describe("arrangeTimeline", () => {
	test("the default view shows everything, newest first", () => {
		expect(ids(arrangeTimeline(entries, readActivityView()))).toEqual([
			"last-comment",
			"moved",
			"edited",
			"first-comment",
		]);
	});

	test("oldest first reverses the order", () => {
		expect(
			ids(arrangeTimeline(entries, { filter: "all", sort: "oldest" })),
		).toEqual(["first-comment", "edited", "moved", "last-comment"]);
	});

	test("comments shows only comments", () => {
		expect(
			ids(arrangeTimeline(entries, { filter: "comments", sort: "newest" })),
		).toEqual(["last-comment", "first-comment"]);
	});

	test("history shows only changes", () => {
		expect(
			ids(arrangeTimeline(entries, { filter: "history", sort: "oldest" })),
		).toEqual(["edited", "moved"]);
	});

	test("leaves the input untouched", () => {
		arrangeTimeline(entries, { filter: "comments", sort: "oldest" });
		expect(ids(entries)).toEqual([
			"edited",
			"first-comment",
			"last-comment",
			"moved",
		]);
	});
});

describe("displayedActivityFilter", () => {
	const arriving = { revealsComment: true, pickedSinceArrival: false };

	test("a comment link shows comments when History is saved", () => {
		expect(displayedActivityFilter("history", arriving)).toBe("all");
	});

	test("filters that already show comments stay as saved", () => {
		expect(displayedActivityFilter("comments", arriving)).toBe("comments");
		expect(displayedActivityFilter("all", arriving)).toBe("all");
	});

	test("a filter picked after arriving wins", () => {
		expect(
			displayedActivityFilter("history", {
				revealsComment: true,
				pickedSinceArrival: true,
			}),
		).toBe("history");
	});

	test("without a comment to reveal the saved filter stands", () => {
		expect(
			displayedActivityFilter("history", {
				revealsComment: false,
				pickedSinceArrival: false,
			}),
		).toBe("history");
	});
});

describe("readActivityView", () => {
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

	const store = (value: string) => stored.set("smelp.activity-view", value);

	test("defaults to all activity, newest first", () => {
		expect(readActivityView()).toEqual({ filter: "all", sort: "newest" });
	});

	test("restores the last choice", () => {
		store(JSON.stringify({ filter: "history", sort: "oldest" }));
		expect(readActivityView()).toEqual({ filter: "history", sort: "oldest" });
	});

	test("falls back to the default for values it doesn't know", () => {
		store(JSON.stringify({ filter: "toString", sort: "sideways" }));
		expect(readActivityView()).toEqual({ filter: "all", sort: "newest" });
	});

	test("falls back to the default when storage holds junk", () => {
		store("{not json");
		expect(readActivityView()).toEqual({ filter: "all", sort: "newest" });
	});
});
