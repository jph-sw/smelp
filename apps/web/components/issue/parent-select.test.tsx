import { describe, expect, mock, test } from "bun:test";
import { render, screen, userEvent } from "#/test/dom";
import { type ParentOption, ParentSelect } from "./parent-select";

const options: ParentOption[] = [
	{ id: "SMELP-3", title: "Board filters", type: "story" },
	{ id: "SMELP-12", title: "Search everywhere", type: "epic" },
	{ id: "SMELP-27", title: "Fix login redirect", type: "bug" },
];

function renderParentSelect(value: string | null) {
	const onChange = mock((_: string | null) => {});
	render(<ParentSelect value={value} options={options} onChange={onChange} />);
	return { user: userEvent.setup(), onChange };
}

const trigger = () => screen.getByRole("button", { name: /^Parent:/ });

const optionNames = () =>
	screen.getAllByRole("option").map((option) => option.textContent);

describe("ParentSelect", () => {
	test("shows the current parent's key and title", () => {
		renderParentSelect("SMELP-12");
		expect(trigger().textContent).toBe("Parent: SMELP-12 Search everywhere");
	});

	test("typing part of a key leaves only the matching work item", async () => {
		const { user } = renderParentSelect(null);
		await user.click(trigger());
		await user.type(screen.getByLabelText("Search for a parent"), "smelp-27");
		expect(optionNames()).toEqual(["SMELP-27Fix login redirect"]);
	});

	test("typing part of a title finds the work item", async () => {
		const { user } = renderParentSelect(null);
		await user.click(trigger());
		await user.type(screen.getByLabelText("Search for a parent"), "board");
		expect(optionNames()).toEqual(["SMELP-3Board filters"]);
	});

	test("says so when nothing matches", async () => {
		const { user } = renderParentSelect(null);
		await user.click(trigger());
		await user.type(screen.getByLabelText("Search for a parent"), "zzz");
		expect(screen.queryAllByRole("option")).toHaveLength(0);
		expect(screen.getByText("No work items found.")).toBeTruthy();
	});

	test("choosing a work item sets it as the parent", async () => {
		const { user, onChange } = renderParentSelect(null);
		await user.click(trigger());
		await user.type(screen.getByLabelText("Search for a parent"), "SMELP-3");
		await user.click(screen.getByRole("option", { name: /Board filters/ }));
		expect(onChange.mock.calls).toEqual([["SMELP-3"]]);
	});

	test("No parent clears the parent", async () => {
		const { user, onChange } = renderParentSelect("SMELP-12");
		await user.click(trigger());
		await user.click(screen.getByRole("option", { name: "No parent" }));
		expect(onChange.mock.calls).toEqual([[null]]);
	});
});
