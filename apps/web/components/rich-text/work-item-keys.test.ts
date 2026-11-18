import { afterEach, describe, expect, mock, test } from "bun:test";
import { Editor, generateJSON, getSchema } from "@tiptap/core";
import type { WorkItemKeyLink } from "#/lib/data/issue";
import "#/test/dom";
import {
	findWorkItemKeys,
	markdownManager,
	parseMarkdown,
	refreshWorkItemKeyLinks,
	richTextExtensions,
	WorkItemKeys,
} from "./extensions";

const manager = markdownManager();
const schema = getSchema(richTextExtensions());
const keysIn = (markdown: string) =>
	findWorkItemKeys(schema.nodeFromJSON(manager.parse(markdown))).map(
		({ key }) => key,
	);

describe("findWorkItemKeys", () => {
	test.each([
		["plain text", "blocked by SMELP-12", ["SMELP-12"]],
		["a full stop after it", "see SMELP-12.", ["SMELP-12"]],
		["brackets around it", "(SMELP-12)", ["SMELP-12"]],
		["a trailing hyphen", "SMELP-12- done", ["SMELP-12"]],
		["several keys", "AB-1, CD-2 and AB-1", ["AB-1", "CD-2", "AB-1"]],
		["lower case and digits", "v2-7", ["v2-7"]],
		["letters outside ASCII", "ÄÖ-3", ["ÄÖ-3"]],
		["bold text", "**SMELP-12**", ["SMELP-12"]],
		["a heading", "# SMELP-12", ["SMELP-12"]],
		["a table cell", "| SMELP-12 |\n| --- |\n| AB-2 |", ["SMELP-12", "AB-2"]],
		["a list item", "- SMELP-12", ["SMELP-12"]],
		["each side of a line break", "AB-1\nCD-2", ["AB-1", "CD-2"]],
	])("finds a key in %s", (_, markdown, keys) => {
		expect(keysIn(markdown)).toEqual(keys);
	});

	test.each([
		["inline code", "`SMELP-12`"],
		["a code block", "```\nSMELP-12\n```"],
		["an existing link", "[SMELP-12](https://example.com)"],
		["a bare address", "https://example.com/SMELP-1"],
		["a project id that is too long", "XSMELPX-1"],
		["a project id that is too short", "X-1"],
		["more text after it", "SMELP-12-foo"],
		["letters after the number", "SMELP-12a"],
		["an underscore before it", "_SMELP-12"],
		["a path", "a/SMELP-12"],
		["a hyphen before it", "x-SMELP-12"],
		["no number", "SMELP-"],
		["a number too long to be a key", `SMELP-${"1".repeat(16)}`],
	])("skips %s", (_, markdown) => {
		expect(keysIn(markdown)).toEqual([]);
	});

	test("reads the characters next to a key across formatting", () => {
		expect(keysIn("**SMELP-12**x")).toEqual([]);
		expect(keysIn("x**SMELP-12**")).toEqual([]);
	});

	test("points at the key's place in the document", () => {
		const doc = schema.nodeFromJSON(manager.parse("a **b** SMELP-12 end"));
		const [found] = findWorkItemKeys(doc);
		if (!found) throw new Error("Expected a key");
		expect(doc.textBetween(found.from, found.to)).toBe("SMELP-12");
	});

	test("counts a mention before the key as one position", () => {
		const doc = schema.nodeFromJSON(
			manager.parse("@[Ada](user:abcd1234efgh) SMELP-12"),
		);
		const [found] = findWorkItemKeys(doc);
		if (!found) throw new Error("Expected a key");
		expect(doc.textBetween(found.from, found.to)).toBe("SMELP-12");
	});
});

describe("stored Markdown", () => {
	test.each([
		"blocked by SMELP-12.",
		"`SMELP-12` and [SMELP-3](https://example.com) and SMELP-4",
	])("stays as written: %s", (markdown) => {
		expect(manager.serialize(manager.parse(markdown))).toBe(markdown);
	});

	test("a pasted key link becomes the plain key", () => {
		const doc = generateJSON(
			'<p><a href="/team/browse/AB-1" data-work-item-key="AB-1">AB-1</a></p>',
			richTextExtensions(),
		);
		expect(manager.serialize(doc)).toBe("AB-1");
	});
});

describe("WorkItemKeys", () => {
	const link: WorkItemKeyLink = {
		id: "AB-1",
		title: "Fix login",
		workspaceId: "team",
		stateName: "Todo",
		stateColor: "#112233",
	};
	let editor: Editor | undefined;

	afterEach(() => editor?.destroy());

	function open(
		markdown: string,
		{
			editable = false,
			links = [link],
		}: { editable?: boolean; links?: WorkItemKeyLink[] } = {},
	) {
		const known = { links };
		const onKeys = mock((_: string[]) => {});
		const navigate = mock((_: string) => {});
		const created = new Editor({
			element: document.createElement("div"),
			editable,
			content: parseMarkdown(markdown),
			extensions: [
				...richTextExtensions(),
				WorkItemKeys.configure({
					lookup: (key) => known.links.find((item) => item.id === key),
					onKeys,
					navigate,
				}),
			],
		});
		editor = created;
		const keyLink = () =>
			created.view.dom.querySelector<HTMLAnchorElement>(
				"a[data-work-item-key]",
			);
		return { editor: created, known, onKeys, navigate, keyLink };
	}

	const click = (element: Element, init: MouseEventInit = {}) => {
		const event = new MouseEvent("click", {
			bubbles: true,
			cancelable: true,
			button: 0,
			...init,
		});
		element.dispatchEvent(event);
		return event;
	};

	test("links a resolved key to its item", () => {
		const element = open("blocked by AB-1.").keyLink();
		expect(element?.textContent).toBe("AB-1");
		expect(element?.getAttribute("href")).toBe("/team/browse/AB-1");
		expect(element?.getAttribute("title")).toBe("Fix login (Todo)");
		expect(element?.style.getPropertyValue("--state-color")).toBe("#112233");
	});

	test("leaves an unknown key and a key in code as text", () => {
		expect(open("CD-2 and `AB-1`").keyLink()).toBeNull();
	});

	test("adds the link once the key resolves, without changing the text", () => {
		const { editor, known, keyLink } = open("AB-1", { links: [] });
		const before = editor.state.doc;
		expect(keyLink()).toBeNull();
		known.links = [link];
		refreshWorkItemKeyLinks(editor.view);
		expect(keyLink()).not.toBeNull();
		expect(editor.state.doc).toBe(before);
		expect(editor.getMarkdown()).toBe("AB-1");
	});

	test("reports sorted, distinct keys, and only when they change", () => {
		const { editor, onKeys } = open("CD-2 AB-1 CD-2", { editable: true });
		expect(onKeys.mock.calls).toEqual([[["AB-1", "CD-2"]]]);
		editor.commands.insertContentAt(1, "x ");
		expect(onKeys).toHaveBeenCalledTimes(1);
		editor.commands.insertContentAt(1, "EF-3 ");
		expect(onKeys).toHaveBeenLastCalledWith(["AB-1", "CD-2", "EF-3"]);
		expect(onKeys).toHaveBeenCalledTimes(2);
	});

	test("reports nothing for a document without keys", () => {
		expect(open("no keys here").onKeys).not.toHaveBeenCalled();
	});

	test("read-only, a plain click navigates inside the app", () => {
		const { keyLink, navigate } = open("AB-1");
		const event = click(keyLink() as Element);
		expect(event.defaultPrevented).toBe(true);
		expect(navigate.mock.calls).toEqual([["/team/browse/AB-1"]]);
	});

	test.each([
		["Ctrl", { ctrlKey: true }],
		["Cmd", { metaKey: true }],
		["Shift", { shiftKey: true }],
	])("read-only, a %s click stays with the browser", (_, modifier) => {
		const { keyLink, navigate } = open("AB-1");
		const event = click(keyLink() as Element, modifier);
		expect(event.defaultPrevented).toBe(false);
		expect(navigate).not.toHaveBeenCalled();
	});

	test("while editing, a plain click doesn't navigate", () => {
		const { keyLink, navigate } = open("AB-1", { editable: true });
		click(keyLink() as Element);
		expect(navigate).not.toHaveBeenCalled();
	});
});
