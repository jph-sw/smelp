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
import type { ListSort } from "#/lib/issue-list-sort";
import { act, cleanup, render, screen, userEvent } from "#/test/dom";
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
		updatedAt: 0,
	},
] as tables["issue"][];

async function renderList(sort: ListSort | undefined) {
	const onChange = mock((_: ListSort | undefined) => {});
	const root = createRootRoute({
		component: () => (
			<IssueList
				issues={issues}
				states={states}
				members={[]}
				workspaceId="team"
				sorting={{ sort, onChange }}
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
	return { onChange, user: userEvent.setup() };
}

describe("IssueList compact sort bar", () => {
	test("choosing Due sorts by due date, earliest first", async () => {
		const { onChange, user } = await renderList(undefined);
		expect(
			screen.queryByRole("button", { name: /Sort (a|de)scending/ }),
		).toBeNull();
		await user.click(screen.getByRole("button", { name: "Board order" }));
		await user.click(screen.getByRole("menuitemradio", { name: "Due" }));
		expect(onChange).toHaveBeenLastCalledWith("due");
	});

	test("the direction toggle reverses the sort", async () => {
		const { onChange, user } = await renderList("due");
		await user.click(screen.getByRole("button", { name: "Sort descending" }));
		expect(onChange).toHaveBeenLastCalledWith("-due");
	});

	test("Board order clears the sort", async () => {
		const { onChange, user } = await renderList("-due");
		await user.click(screen.getByRole("button", { name: "Sort: Due" }));
		await user.click(
			screen.getByRole("menuitemradio", { name: "Board order" }),
		);
		expect(onChange).toHaveBeenLastCalledWith(undefined);
	});
});
