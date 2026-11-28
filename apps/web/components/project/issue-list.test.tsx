import { afterEach, describe, expect, mock, test } from "bun:test";
// ui-sdk's shared shortcuts stay inert when they load before the DOM exists.
import "#/test/dom";
import type { tables } from "@smelp/db";
import {
	createMemoryHistory,
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { formatShortDay } from "#/lib/day";
import type { ListSort } from "#/lib/issue-list-sort";
import type { Placement } from "#/lib/rank";
import { act, cleanup, render, screen, userEvent, within } from "#/test/dom";
import { IssueList } from "./issue-list";

afterEach(cleanup);

const states = [
	{ id: "todo", name: "Todo", color: "#000000", group: "unstarted" },
] as tables["state"][];

const issues = [
	{
		id: "WEB-1",
		title: "Ship the list",
		type: "task",
		state: "todo",
		assignee: null,
		priority: "none",
		dueDate: "2026-12-01",
		rank: "a1",
		updatedAt: 0,
	},
	{
		id: "WEB-2",
		title: "Polish the list",
		type: "task",
		state: "todo",
		assignee: null,
		priority: "none",
		dueDate: null,
		rank: "a2",
		updatedAt: 0,
	},
] as tables["issue"][];

async function renderList(sort: ListSort | undefined) {
	const onChange = mock((_: ListSort | undefined) => {});
	const onMove = mock((_id: string, _placement: Placement) => {});
	const root = createRootRoute({
		component: () => (
			<IssueList
				issues={issues}
				states={states}
				members={[]}
				workspaceId="team"
				sorting={{ sort, onChange }}
				reorder={{ firstId: "WEB-0", lastId: "WEB-9", onMove }}
			/>
		),
	});
	const router = createRouter({
		routeTree: root,
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	await act(() => router.load());
	render(<RouterProvider router={router} />);
	await screen.findByText("Ship the list");
	return { onChange, onMove, user: userEvent.setup() };
}

describe("IssueList compact sort bar", () => {
	test("choosing Due sorts by due date, earliest first", async () => {
		const { onChange, user } = await renderList(undefined);
		expect(
			screen.queryByRole("button", { name: /Sort (a|de)scending/ }),
		).toBeNull();
		await user.click(screen.getByRole("button", { name: "Sort: Rank" }));
		await user.click(screen.getByRole("menuitemradio", { name: "Due" }));
		expect(onChange).toHaveBeenLastCalledWith("due");
		expect(screen.queryByRole("menuitemradio", { name: "Due" })).toBeNull();
	});

	test("the direction toggle reverses the sort", async () => {
		const { onChange, user } = await renderList("due");
		await user.click(screen.getByRole("button", { name: "Sort descending" }));
		expect(onChange).toHaveBeenLastCalledWith("-due");
	});

	test("Rank clears the sort", async () => {
		const { onChange, user } = await renderList("-due");
		await user.click(screen.getByRole("button", { name: "Sort: Due" }));
		await user.click(screen.getByRole("menuitemradio", { name: "Rank" }));
		expect(onChange).toHaveBeenLastCalledWith(undefined);
	});

	test("shows the due date in the title cell for the compact row", async () => {
		await renderList(undefined);
		const titleCell = screen
			.getByRole("link", { name: "Ship the list" })
			.closest("td") as HTMLElement;
		expect(
			within(titleCell).getByText(formatShortDay("2026-12-01")),
		).toBeDefined();
	});
});

describe("IssueList move menu", () => {
	test("moves an item to the top of the whole backlog", async () => {
		const { onMove, user } = await renderList(undefined);
		await user.click(
			screen.getByRole("button", { name: "Move WEB-2 in the backlog" }),
		);
		await user.click(screen.getByRole("menuitem", { name: "Move to top" }));
		expect(onMove).toHaveBeenLastCalledWith("WEB-2", { before: "WEB-0" });
	});

	test("moves an item below the next row, and not past the last row", async () => {
		const { onMove, user } = await renderList(undefined);
		await user.click(
			screen.getByRole("button", { name: "Move WEB-1 in the backlog" }),
		);
		await user.click(screen.getByRole("menuitem", { name: "Move down" }));
		expect(onMove).toHaveBeenLastCalledWith("WEB-1", { after: "WEB-2" });

		await user.click(
			screen.getByRole("button", { name: "Move WEB-2 in the backlog" }),
		);
		expect(
			screen
				.getByRole("menuitem", { name: "Move down" })
				.getAttribute("aria-disabled"),
		).toBe("true");
	});

	test("is only there in backlog order", async () => {
		await renderList("due");
		expect(
			screen.queryByRole("button", { name: /in the backlog$/ }),
		).toBeNull();
	});
});
