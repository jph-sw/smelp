import { afterEach, describe, expect, mock, test } from "bun:test";
import type { Label } from "#/lib/data/label";
import { cleanup, render, screen, userEvent } from "#/test/dom";
import { LabelSelect } from "./label-select";

const label = (id: string, name: string): Label => ({
	id,
	projectId: "p1",
	name,
	color: "#3b82f6",
	createdAt: 0,
});

const labels = [
	label("l1", "customer-reported"),
	label("l2", "frontend"),
	label("l3", "regression"),
];

function renderLabelSelect(value: string[], disabled = false) {
	const onChange = mock((_: string[]) => {});
	render(
		<LabelSelect
			value={value}
			labels={labels}
			disabled={disabled}
			onChange={onChange}
		/>,
	);
	return { user: userEvent.setup(), onChange };
}

const trigger = () => screen.getByRole("button", { name: /^Labels:/ });

describe("LabelSelect", () => {
	// Testing Library's automatic cleanup binds only to the first DOM test file.
	afterEach(cleanup);

	test("shows the item's labels, skipping ones that were deleted", () => {
		renderLabelSelect(["l2", "gone"]);
		expect(trigger().textContent).toBe("Labels: frontend");
	});

	test("says so when the item has no labels", () => {
		renderLabelSelect([]);
		expect(trigger().textContent).toBe("Labels: No labels");
	});

	test("choosing a label adds it to the item's full set", async () => {
		const { user, onChange } = renderLabelSelect(["l2"]);
		await user.click(trigger());
		await user.click(screen.getByRole("option", { name: "regression" }));
		expect(onChange.mock.calls).toEqual([[["l2", "l3"]]]);
	});

	test("choosing a chosen label takes it off", async () => {
		const { user, onChange } = renderLabelSelect(["l1", "l2"]);
		await user.click(trigger());
		await user.click(screen.getByRole("option", { name: "customer-reported" }));
		expect(onChange.mock.calls).toEqual([[["l2"]]]);
	});

	test("typing narrows the list", async () => {
		const { user } = renderLabelSelect([]);
		await user.click(trigger());
		await user.type(screen.getByLabelText("Search labels"), "front");
		expect(
			screen.getAllByRole("option").map((option) => option.textContent),
		).toEqual(["frontend"]);
	});

	test("can't be changed without write access", async () => {
		const { user, onChange } = renderLabelSelect(["l2"], true);
		await user.click(trigger());
		expect(screen.queryAllByRole("option")).toHaveLength(0);
		expect(onChange).not.toHaveBeenCalled();
	});
});
