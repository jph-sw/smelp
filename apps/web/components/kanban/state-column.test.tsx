import { afterEach, describe, expect, mock, test } from "bun:test";
import type { tables } from "@smelp/db";
import { cleanup, render, screen, userEvent } from "#/test/dom";
import { StateColumn } from "./state-column";

const state = {
	id: "state-1",
	name: "In Progress",
	color: "#000000",
} as tables["state"];

const addButton = () =>
	screen.queryByRole("button", { name: "Add work item to In Progress" });

describe("StateColumn add button", () => {
	afterEach(cleanup);

	test("starts a work item from an expanded column", async () => {
		const onCreate = mock(() => {});
		render(<StateColumn state={state} onCreate={onCreate} />);
		await userEvent.setup().click(addButton() as HTMLElement);
		expect(onCreate).toHaveBeenCalledTimes(1);
	});

	test("comes before the collapse toggle in tab order", () => {
		render(
			<StateColumn
				state={state}
				onCreate={() => {}}
				onToggleCollapsed={() => {}}
			/>,
		);
		expect(
			screen.getAllByRole("button").map((b) => b.getAttribute("aria-label")),
		).toEqual(["Add work item to In Progress", "Collapse In Progress"]);
	});

	test("is absent from a collapsed column and without onCreate", () => {
		const { rerender } = render(
			<StateColumn state={state} collapsed onCreate={() => {}} />,
		);
		expect(addButton()).toBeNull();
		rerender(<StateColumn state={state} />);
		expect(addButton()).toBeNull();
	});
});
