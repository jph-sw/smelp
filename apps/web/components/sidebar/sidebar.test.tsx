import { afterEach, describe, expect, test } from "bun:test";
// ui-sdk's shared shortcuts stay inert when they load before the DOM exists.
import "#/test/dom";
import type { tables } from "@smelp/db";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { RichTextEditor } from "#/components/rich-text/rich-text-editor";
import { SidebarProvider } from "#/components/ui/sidebar";
import type { WorkspaceViewer } from "#/lib/workspace-viewer";
import { act, cleanup, render, screen, userEvent } from "#/test/dom";
import {
	closeCreateIssueDialog,
	useCreateIssueDialogStore,
} from "../issue/create-issue-dialog-store";
import { AppSidebar } from "./sidebar";

afterEach(cleanup);

const workspace = { id: "team", name: "Team" } as tables["workspace"];
const projects = [
	{ id: "WEB", name: "Web", isMember: true, isArchived: false },
] as (tables["project"] & { isMember: boolean; isArchived: boolean })[];

function DialogState() {
	const { isOpen, params } = useCreateIssueDialogStore();
	// Named, because ui-sdk's screen reader announcer also has the status role
	// and can be in the body too.
	return (
		<output aria-label="Create dialog">
			{isOpen ? `Creating in ${params.projectName}` : ""}
		</output>
	);
}

const dialogState = () => screen.getByRole("status", { name: "Create dialog" });

async function renderSidebar(viewer: WorkspaceViewer) {
	const root = createRootRoute();
	const group = createRoute({ getParentRoute: () => root, id: "(workspace)" });
	const workspaceRoute = createRoute({
		getParentRoute: () => group,
		path: "$id",
		beforeLoad: () => ({ viewer }),
		component: () => (
			<SidebarProvider>
				<AppSidebar workspace={workspace} projects={projects} />
				<input aria-label="Title" />
				<textarea aria-label="Notes" />
				<RichTextEditor value="" aria-label="Description" />
				<DialogState />
			</SidebarProvider>
		),
	});
	const router = createRouter({
		routeTree: root.addChildren([group.addChildren([workspaceRoute])]),
		history: createMemoryHistory({ initialEntries: ["/team"] }),
	});
	await act(() => router.load());
	render(
		<QueryClientProvider client={new QueryClient()}>
			<RouterProvider router={router} />
		</QueryClientProvider>,
	);
	await screen.findByText("Home");
	return userEvent.setup();
}

const member: WorkspaceViewer = {
	mode: "member",
	role: "member",
	user: { id: "user-1" } as Extract<
		WorkspaceViewer,
		{ mode: "member" }
	>["user"],
};

describe("AppSidebar create shortcut", () => {
	afterEach(() => act(() => closeCreateIssueDialog()));

	test("c opens the create dialog for the project", async () => {
		const user = await renderSidebar(member);
		await user.keyboard("c");
		expect(dialogState().textContent).toBe("Creating in Web");
	});

	test.each(["Title", "Notes", "Description"])(
		"c typed into %s stays text",
		async (field) => {
			const user = await renderSidebar(member);
			await user.type(screen.getByLabelText(field), "c");
			expect(dialogState().textContent).toBe("");
		},
	);

	test("public viewers get no shortcut", async () => {
		const user = await renderSidebar({ mode: "public", user: null });
		await user.keyboard("c");
		expect(dialogState().textContent).toBe("");
	});

	test("the button advertises the key", async () => {
		await renderSidebar(member);
		expect(
			screen
				.getByRole("button", { name: /New work item/ })
				.getAttribute("aria-keyshortcuts"),
		).toBe("C");
	});
});
