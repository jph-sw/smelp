import { afterEach, describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearCreateIssueDrafts } from "#/lib/create-issue-draft";
import { act, cleanup, render, screen, userEvent } from "#/test/dom";
import { CreateIssueDialog } from "./create-issue-dialog";
import {
	closeCreateIssueDialog,
	openCreateIssueDialog,
} from "./create-issue-dialog-store";

const project = {
	workspaceId: "team",
	projectId: "project-1",
	projectName: "Project",
};

function renderDialog() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { enabled: false, staleTime: Infinity } },
	});
	queryClient.setQueryData(["auth", "me"], { id: "user-1" });
	render(
		<QueryClientProvider client={queryClient}>
			<CreateIssueDialog />
		</QueryClientProvider>,
	);
	return userEvent.setup();
}

const open = (params = project) =>
	act(async () => openCreateIssueDialog(params));
const title = () => screen.getByLabelText<HTMLInputElement>("Title");
const discard = () => screen.queryByRole("button", { name: "Discard draft" });

describe("CreateIssueDialog drafts", () => {
	afterEach(() => {
		cleanup();
		act(() => closeCreateIssueDialog());
		clearCreateIssueDrafts();
	});

	test("an untouched dialog closes on Escape and offers no discard", async () => {
		const user = renderDialog();
		await open();
		expect(discard()).toBeNull();
		await user.keyboard("{Escape}");
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	test("a title typed before Escape is there on reopening", async () => {
		const user = renderDialog();
		await open();
		await user.type(title(), "Fix login");
		await user.keyboard("{Escape}");
		expect(screen.queryByRole("dialog")).toBeNull();
		await open();
		expect(title().value).toBe("Fix login");
	});

	test("a title typed before the close button is there on reopening", async () => {
		const user = renderDialog();
		await open();
		await user.type(title(), "Fix login");
		await user.click(screen.getByRole("button", { name: "Close" }));
		await open();
		expect(title().value).toBe("Fix login");
	});

	test("a sub-item starts from its own draft", async () => {
		const user = renderDialog();
		await open();
		await user.type(title(), "Top level");
		await user.keyboard("{Escape}");
		await open({ ...project, parentId: "SMELP-3" } as typeof project);
		expect(title().value).toBe("");
	});

	test("clearing the title by hand removes the discard button", async () => {
		const user = renderDialog();
		await open();
		await user.type(title(), "x");
		expect(discard()).not.toBeNull();
		await user.clear(title());
		expect(discard()).toBeNull();
	});

	test("discarding empties the form and focuses the title", async () => {
		const user = renderDialog();
		await open();
		await user.type(title(), "Fix login");
		await user.click(discard() as HTMLElement);
		expect(title().value).toBe("");
		expect(discard()).toBeNull();
		expect(document.activeElement === title()).toBe(true);
		await user.keyboard("{Escape}");
		await open();
		expect(title().value).toBe("");
	});
});
