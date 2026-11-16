import { describe, expect, test } from "bun:test";
import { getSchema, type JSONContent } from "@tiptap/core";
import { markdownManager, richTextExtensions } from "./extensions";

// The editor's own Markdown setup, without a DOM: what it reads from a stored
// description and what it writes back on save.
const manager = markdownManager();
const parse = (markdown: string) => manager.parse(markdown);
const save = (markdown: string) => manager.serialize(parse(markdown));

const nodeTypes = (doc: JSONContent): string[] => [
	doc.type ?? "",
	...(doc.content ?? []).flatMap(nodeTypes),
];

describe("description Markdown", () => {
	test.each([
		["line breaks", "line one\nline two\n\nnext paragraph"],
		["headings", "# One\n\n## Two\n\n### Three"],
		["lists", "- a\n- b\n  - nested\n\n1. first\n2. second"],
		["task lists", "- [ ] todo\n- [x] done\n  - [ ] nested"],
		["quotes", "> quoted\n> more"],
		["code blocks", "```ts\nconst a = 1;\n\nconst b = 2;\n```"],
		["dividers", "above\n\n---\n\nbelow"],
		["tables", "| A   | B   |\n| --- | --- |\n| 1   | 2   |"],
		["attachment images", "see ![shot](/api/attachments/abc-123) here"],
		["image titles", '![shot](/api/attachments/abc-123 "Login page")'],
		[
			"inline marks",
			"**bold** *italic* ~~gone~~ `code` [site](https://example.com)",
		],
		["plain text with symbols", "R&D < 5 > 3, snake_case"],
	])("keeps %s as written", (_, markdown) => {
		expect(save(markdown)).toBe(markdown);
	});

	test.each([
		["an image on its own line", "![shot](/api/attachments/abc-123)"],
		["an outside image on its own line", "![x](https://evil.example/a.png)"],
		["an image with a bad link on its own line", "![x](javascript:alert(1))"],
		["raw HTML", '<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">'],
	])("reads %s into a valid document", (_, markdown) => {
		const schema = getSchema(richTextExtensions());
		expect(() => schema.nodeFromJSON(parse(markdown)).check()).not.toThrow();
	});

	test("reads single newlines in old plain-text descriptions as line breaks", () => {
		expect(nodeTypes(parse("line one\nline two"))).toContain("hardBreak");
	});

	test("reads each Markdown block as its node", () => {
		const types = nodeTypes(
			parse(
				"# H\n\n- [ ] task\n\n| A |\n| - |\n| 1 |\n\n```\ncode\n```\n\n---\n\n![a](/api/attachments/a1)",
			),
		);
		for (const type of [
			"heading",
			"taskList",
			"taskItem",
			"table",
			"tableHeader",
			"tableCell",
			"codeBlock",
			"horizontalRule",
			"image",
		]) {
			expect(types).toContain(type);
		}
	});

	test("settles tables and other spellings after one save", () => {
		for (const markdown of [
			"| A | B |\n|-|-|\n| 1 | 2 |",
			"* star\n* list",
			"1) one",
			"text  \nwith a two-space break",
		]) {
			const once = save(markdown);
			expect(save(once)).toBe(once);
		}
	});

	test("escapes text that would otherwise read as Markdown", () => {
		expect(save("\\[not a link\\](x) and \\_under\\_")).toBe(
			"\\[not a link\\](x) and \\_under\\_",
		);
		expect(save("a [b] c, 2 * 3")).toBe("a \\[b\\] c, 2 \\* 3");
	});

	test("writes a line break in a table cell as <br> and reads it back", () => {
		const markdown = "| a<br>b |\n| ------ |\n| c      |";
		expect(save(markdown)).toBe(markdown);
	});

	test("keeps raw HTML as text instead of reading it as nodes", () => {
		const markdown =
			'<script>alert(1)</script>\n\n<img src=x onerror="alert(1)"> and <b>bold</b>';
		const doc = parse(markdown);
		expect(nodeTypes(doc)).not.toContain("image");
		expect(JSON.stringify(doc)).not.toContain('"bold"');
		expect(save(markdown)).toBe(markdown);
	});

	test("drops javascript: links but keeps their text", () => {
		expect(save("[click](javascript:alert(1)) and [ok](/browse/VER-1)")).toBe(
			"click and [ok](/browse/VER-1)",
		);
	});

	test("turns images from other sites into links", () => {
		expect(save("![tracker](https://evil.example/a.png)")).toBe(
			"[tracker](https://evil.example/a.png)",
		);
		expect(save("![x](javascript:alert(1))")).toBe("x");
	});
});
