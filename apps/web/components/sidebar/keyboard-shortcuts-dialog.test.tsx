import { afterEach, describe, expect, test } from "bun:test";
// ui-sdk's shared shortcuts stay inert when they load before the DOM exists.
import "#/test/dom";
import { formatShortcut, useShortcut } from "@ui-sdk/react/shortcuts";
import { cleanup, render, screen, userEvent, within } from "#/test/dom";
import { KeyboardShortcutsDialog } from "./keyboard-shortcuts-dialog";

afterEach(cleanup);

function PageShortcuts() {
	useShortcut("c", () => {}, { description: "Create a work item" });
	useShortcut("/", () => {}, { description: "Search work items" });
	useShortcut("shift+/", () => {});
	return null;
}

function renderPage() {
	render(
		<>
			<PageShortcuts />
			<KeyboardShortcutsDialog />
		</>,
	);
	return userEvent.setup();
}

const rows = () =>
	within(screen.getByRole("dialog", { name: "Keyboard shortcuts" }))
		.getAllByRole("term")
		.map((term) => [term.textContent, term.nextElementSibling?.textContent]);

describe("KeyboardShortcutsDialog", () => {
	test("Shift+? lists every described shortcut with its keys", async () => {
		const user = renderPage();
		await user.keyboard("{Shift>}?{/Shift}");
		expect(rows()).toEqual([
			["Create a work item", formatShortcut("c")],
			["Search work items", formatShortcut("/")],
			["Show keyboard shortcuts", formatShortcut("shift+?")],
		]);
	});

	test("typing ? into a field doesn't open it", async () => {
		render(
			<>
				<input aria-label="Title" />
				<KeyboardShortcutsDialog />
			</>,
		);
		const user = userEvent.setup();
		await user.click(screen.getByLabelText("Title"));
		await user.keyboard("{Shift>}?{/Shift}");
		expect(screen.getByLabelText<HTMLInputElement>("Title").value).toBe("?");
		expect(screen.queryByRole("dialog")).toBeNull();
	});
});
