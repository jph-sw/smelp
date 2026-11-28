import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
// ui-sdk's shared shortcuts stay inert when they load before the DOM exists.
import "#/test/dom";
import type { tables } from "@smelp/db";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { act, cleanup, render, screen, userEvent, within } from "#/test/dom";
import { CyclePlanner } from "./cycle-planner";

const states = [
	{ id: "todo", name: "Todo", color: "#000000", group: "unstarted" },
] as tables["state"][];

const item = (id: string, estimate: number | null, cycleId: string | null) =>
	({
		id,
		title: `Title of ${id}`,
		type: "task",
		state: "todo",
		priority: "none",
		assignee: null,
		dueDate: null,
		rank: id,
		cycleId,
		estimate,
		updatedAt: 0,
	}) as tables["issue"];

let server: tables["issue"][];
let updates: unknown[];
let failUpdates: boolean;
let gate: Promise<void> | undefined;

beforeEach(() => {
	server = [item("WEB-1", 3, null), item("WEB-2", null, null)];
	updates = [];
	failUpdates = false;
	gate = undefined;
	spyOn(globalThis, "fetch").mockImplementation((async (request: Request) => {
		const { pathname } = new URL(request.url);
		const reply = (json: unknown, status = 200) =>
			new Response(JSON.stringify({ json }), {
				status,
				headers: { "content-type": "application/json" },
			});
		if (pathname === "/rpc/issue/update") {
			const { json } = await request.json();
			updates.push(json);
			await gate;
			if (failUpdates) return reply({ message: "Nope" }, 500);
			server = server.map((issue) =>
				issue.id === json.id ? { ...issue, cycleId: json.cycleId } : issue,
			);
			return reply(server.find((issue) => issue.id === json.id));
		}
		if (pathname === "/rpc/issues/find") return reply(server);
		return reply([]);
	}) as typeof fetch);
});

afterEach(() => {
	cleanup();
	(globalThis.fetch as unknown as { mockRestore: () => void }).mockRestore();
});

async function renderPlanner() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { staleTime: Infinity, retry: false } },
	});
	queryClient.setQueryData(["issues", "p1"], server);
	queryClient.setQueryData(["states", "p1"], states);
	const root = createRootRoute({
		component: () => (
			<CyclePlanner workspaceId="team" projectId="p1" cycleId="c1" />
		),
	});
	const router = createRouter({
		routeTree: root,
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	await act(() => router.load());
	render(
		<QueryClientProvider client={queryClient}>
			<RouterProvider router={router} />
		</QueryClientProvider>,
	);
	await screen.findByText("Title of WEB-1");
	return userEvent.setup();
}

const pane = (name: string) => screen.getByRole("list", { name });
const totals = () =>
	screen.getByText(/points?( ·|$)/, { selector: "p" }).textContent;

describe("CyclePlanner", () => {
	test("adding items moves them into the cycle and updates the total", async () => {
		const user = await renderPlanner();
		expect(
			screen.getByText("Nothing planned yet. Add work items from the backlog."),
		).toBeTruthy();

		await user.click(
			screen.getByRole("button", { name: "Add WEB-1 to cycle" }),
		);
		expect(within(pane("In this cycle")).getByText("WEB-1")).toBeTruthy();
		expect(within(pane("Backlog")).queryByText("WEB-1")).toBeNull();
		expect(totals()).toBe("3 points");

		await user.click(
			screen.getByRole("button", { name: "Add WEB-2 to cycle" }),
		);
		expect(totals()).toBe("3 points · 1 unestimated");
		expect(
			screen.getByText("Every open work item is already in a cycle."),
		).toBeTruthy();
		expect(updates).toEqual([
			{ id: "WEB-1", cycleId: "c1" },
			{ id: "WEB-2", cycleId: "c1" },
		]);
	});

	test("removing an item sends it back to the backlog", async () => {
		server = [item("WEB-1", 2, "c1")];
		const user = await renderPlanner();
		expect(totals()).toBe("2 points");

		await user.click(
			screen.getByRole("button", { name: "Remove WEB-1 from cycle" }),
		);
		expect(within(pane("Backlog")).getByText("WEB-1")).toBeTruthy();
		expect(totals()).toBe("0 points");
		expect(updates).toEqual([{ id: "WEB-1", cycleId: null }]);
	});

	test("the item and the total move before the server answers", async () => {
		const { promise, resolve } = Promise.withResolvers<void>();
		gate = promise;
		const user = await renderPlanner();
		await user.click(
			screen.getByRole("button", { name: "Add WEB-1 to cycle" }),
		);
		expect(within(pane("In this cycle")).getByText("WEB-1")).toBeTruthy();
		expect(totals()).toBe("3 points");
		expect(server.find((issue) => issue.id === "WEB-1")?.cycleId).toBeNull();
		await act(async () => resolve());
	});

	test("a failed move puts the item back", async () => {
		failUpdates = true;
		const user = await renderPlanner();
		await user.click(
			screen.getByRole("button", { name: "Add WEB-1 to cycle" }),
		);
		expect(await within(pane("Backlog")).findByText("WEB-1")).toBeTruthy();
		expect(totals()).toBe("0 points");
	});
});
