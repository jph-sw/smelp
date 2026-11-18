import { beforeEach, describe, expect, test } from "bun:test";
import {
	type CreateIssueDraft,
	clearCreateIssueDrafts,
	deleteCreateIssueDraft,
	EMPTY_CREATE_ISSUE_DRAFT,
	readCreateIssueDraft,
	saveCreateIssueDraft,
} from "./create-issue-draft";

const project = { projectId: "project-1" };
const draft: CreateIssueDraft = {
	...EMPTY_CREATE_ISSUE_DRAFT,
	title: "Fix login",
	description: "It loops.",
};

describe("create issue drafts", () => {
	beforeEach(clearCreateIssueDrafts);

	test("a project without a draft reads as empty", () => {
		expect(readCreateIssueDraft(project)).toEqual(EMPTY_CREATE_ISSUE_DRAFT);
	});

	test("a saved draft reads back", () => {
		saveCreateIssueDraft(project, draft);
		expect(readCreateIssueDraft(project)).toEqual(draft);
	});

	test("each project keeps its own draft", () => {
		saveCreateIssueDraft(project, draft);
		expect(readCreateIssueDraft({ projectId: "project-2" })).toEqual(
			EMPTY_CREATE_ISSUE_DRAFT,
		);
	});

	test("a sub-item draft is separate from the project's draft", () => {
		const child = { projectId: "project-1", parentId: "SMELP-3" };
		const childDraft = { ...draft, title: "Child" };
		saveCreateIssueDraft(project, draft);
		saveCreateIssueDraft(child, childDraft);
		expect(readCreateIssueDraft(project)).toEqual(draft);
		expect(readCreateIssueDraft(child)).toEqual(childDraft);
		expect(
			readCreateIssueDraft({ projectId: "project-1", parentId: "SMELP-4" }),
		).toEqual(EMPTY_CREATE_ISSUE_DRAFT);
	});

	test("emptying a draft by hand removes it", () => {
		saveCreateIssueDraft(project, draft);
		saveCreateIssueDraft(project, { ...EMPTY_CREATE_ISSUE_DRAFT });
		expect(readCreateIssueDraft(project)).toEqual(EMPTY_CREATE_ISSUE_DRAFT);
	});

	test("a non-text choice alone is kept", () => {
		const choice = { ...EMPTY_CREATE_ISSUE_DRAFT, priority: "high" as const };
		saveCreateIssueDraft(project, choice);
		expect(readCreateIssueDraft(project)).toEqual(choice);
	});

	test("deleting removes only that draft", () => {
		const other = { projectId: "project-2" };
		saveCreateIssueDraft(project, draft);
		saveCreateIssueDraft(other, draft);
		deleteCreateIssueDraft(project);
		expect(readCreateIssueDraft(project)).toEqual(EMPTY_CREATE_ISSUE_DRAFT);
		expect(readCreateIssueDraft(other)).toEqual(draft);
	});

	test("clearing removes every draft", () => {
		const other = { projectId: "project-2" };
		saveCreateIssueDraft(project, draft);
		saveCreateIssueDraft(other, draft);
		clearCreateIssueDrafts();
		expect(readCreateIssueDraft(project)).toEqual(EMPTY_CREATE_ISSUE_DRAFT);
		expect(readCreateIssueDraft(other)).toEqual(EMPTY_CREATE_ISSUE_DRAFT);
	});
});
