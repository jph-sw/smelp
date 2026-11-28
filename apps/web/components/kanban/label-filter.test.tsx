import { afterEach, describe, expect, mock, test } from "bun:test";
import type { Label } from "#/lib/data/label";
import { cleanup, render, screen, userEvent } from "#/test/dom";
import { LabelFilter } from "./label-filter";

const label = (id: string, name: string): Label => ({
	id,
	projectId: "p1",
	name,
	color: "#22c55e",
	createdAt: 0,
});

const labels = [label("l1", "backend"), label("l2", "frontend")];

function renderLabelFilter(value: string[] | undefined) {
	const onChange = mock((_: string[] | undefined) => {});
	render(<LabelFilter value={value} labels={labels} onChange={onChange} />);
	return { user: userEvent.setup(), onChange };
}

const trigger = () => screen.getByRole("button", { name: /^Label:/ });

describe("LabelFilter", () => {
	// Testing Library's automatic cleanup binds only to the first DOM test file.
	afterEach(cleanup);

	test("reads Any label without a filter", () => {
		renderLabelFilter(undefined);
		expect(trigger().textContent).toBe("Label: Any label");
	});

	test("names the chosen label", () => {
		renderLabelFilter(["l2"]);
		expect(trigger().textContent).toContain("frontend");
	});

	test("choosing another label keeps the first one", async () => {
		const { user, onChange } = renderLabelFilter(["l1"]);
		await user.click(trigger());
		await user.click(screen.getByRole("option", { name: "frontend" }));
		expect(onChange.mock.calls).toEqual([[["l1", "l2"]]]);
	});

	test("taking off the last label clears the filter", async () => {
		const { user, onChange } = renderLabelFilter(["l1"]);
		await user.click(trigger());
		await user.click(screen.getByRole("option", { name: "backend" }));
		expect(onChange.mock.calls).toEqual([[undefined]]);
	});
});
