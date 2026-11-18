import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { commentDraftStore } from "./comment-draft";

const AFTER_SAVE_DELAY_MS = 350;

describe("commentDraftStore", () => {
	const stored = new Map<string, string>();
	const original = globalThis.localStorage;

	beforeEach(() => {
		stored.clear();
		globalThis.localStorage = {
			getItem: (key: string) => stored.get(key) ?? null,
			setItem: (key: string, value: string) => stored.set(key, value),
			removeItem: (key: string) => stored.delete(key),
		} as unknown as Storage;
	});

	afterEach(() => {
		globalThis.localStorage = original;
	});

	const saved = (userId: string, issueId: string, markdown: string) => {
		const store = commentDraftStore(userId, issueId);
		store.save(markdown);
		store.flush();
	};
	const reopened = (userId = "ann", issueId = "item-1") =>
		commentDraftStore(userId, issueId).read();

	test("has no draft to begin with", () => {
		expect(reopened()).toBe("");
	});

	test("restores a saved draft", () => {
		saved("ann", "item-1", "**half** a thought");
		expect(reopened()).toBe("**half** a thought");
	});

	test("keeps a draft for each work item", () => {
		saved("ann", "item-1", "first");
		saved("ann", "item-2", "second");
		expect(reopened("ann", "item-1")).toBe("first");
		expect(reopened("ann", "item-2")).toBe("second");
	});

	test("keeps a draft for each person", () => {
		saved("ann", "item-1", "from ann");
		expect(reopened("bob", "item-1")).toBe("");
	});

	test("writes a save only after the delay", async () => {
		const store = commentDraftStore("ann", "item-1");
		store.save("typing");
		expect(reopened()).toBe("");
		await Bun.sleep(AFTER_SAVE_DELAY_MS);
		expect(reopened()).toBe("typing");
	});

	test("the latest text wins when saves come quickly", async () => {
		const store = commentDraftStore("ann", "item-1");
		store.save("typ");
		store.save("typing");
		await Bun.sleep(AFTER_SAVE_DELAY_MS);
		expect(reopened()).toBe("typing");
	});

	test("flush writes a waiting save at once", () => {
		const store = commentDraftStore("ann", "item-1");
		store.save("leaving now");
		store.flush();
		expect(reopened()).toBe("leaving now");
	});

	test("flush with nothing waiting leaves the draft alone", () => {
		saved("ann", "item-1", "kept");
		commentDraftStore("ann", "item-1").flush();
		expect(reopened()).toBe("kept");
	});

	test("clear removes the draft", () => {
		saved("ann", "item-1", "posted");
		commentDraftStore("ann", "item-1").clear();
		expect(reopened()).toBe("");
		expect(stored.size).toBe(0);
	});

	test("a save waiting at clear doesn't bring the draft back", async () => {
		const store = commentDraftStore("ann", "item-1");
		store.save("posted");
		store.clear();
		store.flush();
		await Bun.sleep(AFTER_SAVE_DELAY_MS);
		expect(reopened()).toBe("");
	});

	test.each(["", "  \n "])("blank text %j removes the draft", (blank) => {
		saved("ann", "item-1", "something");
		saved("ann", "item-1", blank);
		expect(stored.size).toBe(0);
	});

	test("methods work detached from the store", () => {
		const { read, save, flush, clear } = commentDraftStore("ann", "item-1");
		save("detached");
		flush();
		expect(read()).toBe("detached");
		clear();
		expect(read()).toBe("");
	});

	test("unusable storage behaves as no draft and never throws", async () => {
		const fail = () => {
			throw new Error("storage is unavailable");
		};
		globalThis.localStorage = {
			getItem: fail,
			setItem: fail,
			removeItem: fail,
		} as unknown as Storage;

		const store = commentDraftStore("ann", "item-1");
		expect(store.read()).toBe("");
		store.save("text");
		store.flush();
		store.save("more");
		await Bun.sleep(AFTER_SAVE_DELAY_MS);
		store.clear();
		expect(store.read()).toBe("");
	});
});
