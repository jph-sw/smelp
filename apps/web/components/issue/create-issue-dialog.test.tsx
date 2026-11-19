import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearCreateIssueDrafts } from "#/lib/create-issue-draft";
import { act, cleanup, render, screen, userEvent, waitFor } from "#/test/dom";
import { CreateIssueDialog } from "./create-issue-dialog";
import {
	type CreateIssueDialogParams,
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
	queryClient.setQueryData(
		["states", project.projectId],
		[{ id: "state-1", isDefault: true }],
	);
	queryClient.setQueryData(
		["project-members", project.projectId],
		[{ userId: "user-1", displayName: "Me", fullName: "Me" }],
	);
	render(
		<QueryClientProvider client={queryClient}>
			<CreateIssueDialog />
		</QueryClientProvider>,
	);
	return userEvent.setup();
}

const open = (params: CreateIssueDialogParams = project) =>
	act(async () => openCreateIssueDialog(params));
const title = () => screen.getByLabelText<HTMLInputElement>("Title");
const discard = () => screen.queryByRole("button", { name: "Discard draft" });

describe("CreateIssueDialog destination", () => {
	afterEach(() => {
		cleanup();
		act(() => closeCreateIssueDialog());
		clearCreateIssueDrafts();
	});

	test("without a destination it names just the project", async () => {
		renderDialog();
		await open();
		expect(screen.getByText("In Project")).toBeTruthy();
	});

	test.each([
		["state", "In Progress", "In Project · State: In Progress"],
		["cycle", "Sprint 1", "In Project · Cycle: Sprint 1"],
		["module", "Auth", "In Project · Module: Auth"],
	] as const)("names a %s destination", async (kind, name, description) => {
		renderDialog();
		await open({ ...project, destination: { kind, id: "target", name } });
		expect(screen.getByText(description)).toBeTruthy();
	});

	test("a draft follows the user to another destination", async () => {
		const user = renderDialog();
		await open({
			...project,
			destination: { kind: "cycle", id: "cycle-1", name: "Sprint 1" },
		});
		await user.type(title(), "Fix login");
		await user.keyboard("{Escape}");
		await open({
			...project,
			destination: { kind: "module", id: "module-1", name: "Auth" },
		});
		expect(title().value).toBe("Fix login");
		expect(screen.getByText("In Project · Module: Auth")).toBeTruthy();
	});
});

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
		await open({ ...project, parentId: "SMELP-3" });
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

describe("CreateIssueDialog create another", () => {
	afterEach(() => {
		fetchSpy.mockRestore();
		cleanup();
		act(() => closeCreateIssueDialog());
		clearCreateIssueDrafts();
	});

	let creates = 0;
	let release: Promise<void> = Promise.resolve();
	let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;

	beforeEach(() => {
		creates = 0;
		release = Promise.resolve();
		fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async () => {
			creates += 1;
			await release;
			return Response.json({ json: { id: "VER-2", title: "Created" } });
		}) as unknown as typeof fetch);
	});

	const createAnother = () =>
		screen.getByRole("switch", { name: "Create another" });
	const type = () => screen.getByRole("combobox", { name: "Type" });
	const description = () =>
		screen.getByRole("textbox", { name: "Description" });

	test("with the toggle on, a create clears the text and keeps the rest", async () => {
		const user = renderDialog();
		await open();
		await user.click(createAnother());
		await user.click(type());
		await user.click(await screen.findByRole("option", { name: "Bug" }));
		await user.type(title(), "First{Enter}");
		await waitFor(() => expect(title().value).toBe(""));
		expect(creates).toBe(1);
		expect(screen.getByRole("dialog")).toBeTruthy();
		expect(document.activeElement === title()).toBe(true);
		expect(type().textContent).toContain("Bug");
		expect(createAnother().getAttribute("aria-checked")).toBe("true");
	});

	test("text typed during a slow create starts the next item", async () => {
		let finish = () => {};
		release = new Promise((resolve) => {
			finish = resolve;
		});
		const user = renderDialog();
		await open();
		await user.click(createAnother());
		await user.type(title(), "First");
		await user.type(description(), "Details");
		await user.click(title());
		await user.keyboard("{Enter}");
		await waitFor(() => expect(creates).toBe(1));
		await user.type(title(), "Next");
		expect(title().value).toBe("Next");
		finish();
		await waitFor(() =>
			expect(
				screen.getByRole("button", { name: "Create work item" }),
			).toHaveProperty("disabled", false),
		);
		expect(title().value).toBe("Next");
		expect(description().textContent).toBe("");
	});

	test("a failed create keeps the submitted title and description", async () => {
		fetchSpy.mockImplementation((async () => {
			creates += 1;
			return Response.json(
				{
					json: {
						defined: false,
						code: "INTERNAL_SERVER_ERROR",
						status: 500,
						message: "Boom",
					},
				},
				{ status: 500 },
			);
		}) as unknown as typeof fetch);
		const user = renderDialog();
		await open();
		await user.click(createAnother());
		await user.type(title(), "First");
		await user.type(description(), "Details");
		await user.click(title());
		await user.keyboard("{Enter}");
		await waitFor(() => expect(creates).toBe(1));
		await waitFor(() => expect(title().value).toBe("First"));
		expect(description().textContent).toBe("Details");
	});

	test("with the toggle off, a create closes the dialog", async () => {
		const user = renderDialog();
		await open();
		await user.type(title(), "First{Enter}");
		await waitFor(() =>
			expect(screen.queryByRole("dialog") === null).toBe(true),
		);
	});

	test("Assign to me fills the assignee and sends it on create", async () => {
		const user = renderDialog();
		await open();
		await user.click(screen.getByRole("button", { name: "Assign to me" }));
		expect(screen.getByRole("button", { name: "Assignee: Me" })).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Assign to me" })).toBeNull();
		await user.type(title(), "First{Enter}");
		await waitFor(() => expect(creates).toBe(1));
		const request = fetchSpy.mock.calls[0]?.[0] as Request;
		expect((await request.json()).json.assignee).toBe("user-1");
	});

	test("Ctrl+Enter in the description creates the item", async () => {
		const user = renderDialog();
		await open();
		await user.type(title(), "First");
		await user.click(screen.getByRole("textbox", { name: "Description" }));
		await user.keyboard("{Control>}{Enter}{/Control}");
		await waitFor(() => expect(creates).toBe(1));
	});

	test("repeated Ctrl+Enter during a create sends one request", async () => {
		let finish = () => {};
		release = new Promise((resolve) => {
			finish = resolve;
		});
		const user = renderDialog();
		await open();
		await user.type(title(), "First");
		await user.click(screen.getByRole("textbox", { name: "Description" }));
		await user.keyboard("{Control>}{Enter}{Enter}{Enter}{/Control}");
		await waitFor(() => expect(creates).toBe(1));
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 20));
		});
		expect(creates).toBe(1);
		finish();
		await waitFor(() =>
			expect(screen.queryByRole("dialog") === null).toBe(true),
		);
	});
});
