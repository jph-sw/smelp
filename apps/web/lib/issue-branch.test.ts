import { describe, expect, test } from "bun:test";
import { issueBranchName } from "./issue-branch";

describe("issueBranchName", () => {
	test("joins the lowercased key and the title slug", () => {
		expect(issueBranchName("SMELP-12", "Copy item key")).toBe(
			"smelp-12-copy-item-key",
		);
	});

	test("collapses punctuation and trims it from both ends", () => {
		expect(issueBranchName("SMELP-12", "  [Bug]: can't   log in!  ")).toBe(
			"smelp-12-bug-can-t-log-in",
		);
	});

	test("folds diacritics to plain letters", () => {
		expect(issueBranchName("SMELP-12", "Crème brûlée für Zoë")).toBe(
			"smelp-12-creme-brulee-fur-zoe",
		);
	});

	test("caps the slug at 50 characters without a trailing hyphen", () => {
		const branch = issueBranchName("SMELP-12", `${"a".repeat(49)} bcd`);
		expect(branch).toBe(`smelp-12-${"a".repeat(49)}`);

		const uncut = issueBranchName("SMELP-12", "a".repeat(80));
		expect(uncut).toBe(`smelp-12-${"a".repeat(50)}`);
	});

	test("a title with nothing to slug gives the bare key", () => {
		expect(issueBranchName("SMELP-12", "🚀🚀")).toBe("smelp-12");
		expect(issueBranchName("SMELP-12", "日本語")).toBe("smelp-12");
	});

	test("leaves out keys of the same project that the title names", () => {
		expect(issueBranchName("SMELP-12", "Follow up on SMELP-3")).toBe(
			"smelp-12-follow-up-on",
		);
		expect(issueBranchName("SMELP-12", "Smelp 3 rollout")).toBe(
			"smelp-12-rollout",
		);
		expect(issueBranchName("SMELP-12", "SMELP-3")).toBe("smelp-12");
	});

	test("keeps keys of other projects and longer words", () => {
		expect(issueBranchName("SMELP-12", "Match ABC-3 in xsmelp-4")).toBe(
			"smelp-12-match-abc-3-in-xsmelp-4",
		);
	});
});
