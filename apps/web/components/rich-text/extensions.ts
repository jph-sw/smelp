import type { AnyExtension, JSONContent } from "@tiptap/core";
import { HardBreak } from "@tiptap/extension-hard-break";
import { Image } from "@tiptap/extension-image";
import { Link } from "@tiptap/extension-link";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Paragraph } from "@tiptap/extension-paragraph";
import {
	Table,
	TableCell,
	TableHeader,
	TableRow,
} from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import { Markdown, MarkdownManager } from "@tiptap/markdown";
import { StarterKit } from "@tiptap/starter-kit";
import { Marked, type marked, Tokenizer, type Tokens } from "marked";
import { isAttachmentUrl } from "#/lib/attachment-url";

// Anything with a scheme other than these is dropped, so a description can't
// carry a javascript: or data: link. Paths without a scheme stay.
export function isSafeHref(href: string | null | undefined) {
	if (!href) return false;
	const scheme = /^\s*([a-z][a-z\d+.-]*):/i.exec(href)?.[1]?.toLowerCase();
	return (
		!scheme || scheme === "http" || scheme === "https" || scheme === "mailto"
	);
}

// Raw HTML in a description is shown as the text it is, never parsed into
// nodes, the same as when descriptions were rendered with react-markdown. The
// one exception is <br>, which is how a line break inside a table cell is
// written.
function htmlAsTextMarked() {
	const instance = new Marked({ gfm: true, breaks: true });
	instance.use({
		tokenizer: {
			html(src) {
				const token = Tokenizer.prototype.html.call(this, src);
				if (!token) return false;
				const text = token.text.trimEnd();
				const paragraph: Tokens.Paragraph = {
					type: "paragraph",
					raw: token.raw,
					text,
					tokens: this.lexer.inline(text),
				};
				// marked types each tokenizer by the token it makes by default.
				return paragraph as unknown as Tokens.HTML;
			},
			tag(src) {
				const token = Tokenizer.prototype.tag.call(this, src);
				if (!token) return false;
				const replacement: Tokens.Br | Tokens.Text = /^<br\s*\/?>$/i.test(
					token.raw,
				)
					? { type: "br", raw: token.raw }
					: { type: "text", raw: token.raw, text: token.raw };
				return replacement as unknown as Tokens.Tag;
			},
		},
	});
	// The extension asks for marked's default export, but only uses what an
	// instance has too. Its own instance keeps the tokenizers above, and those of
	// the extensions, out of every other use of marked.
	return instance as unknown as typeof marked;
}

// The serializer writes every &, < and > as an entity, for parsers that read
// HTML, and escapes every _. HTML is read as text here, so only an & that would
// read as an entity needs one, and an _ inside a word never starts emphasis, so
// "R&D" and "snake_case" stay as typed in the stored Markdown. The original
// still decides whether the text is code, which is written as is.
type TextEncoder = (
	this: unknown,
	text: string,
	node: JSONContent,
	parent?: JSONContent,
) => string;
const managerPrototype = MarkdownManager.prototype as unknown as {
	encodeTextForMarkdown: TextEncoder;
};
const encodeText = managerPrototype.encodeTextForMarkdown;
managerPrototype.encodeTextForMarkdown = function (text, node, parent) {
	if (encodeText.call(this, "&", node, parent) === "&") return text;
	return text
		.replace(/&(?=#\d{1,7};|#x[\da-f]{1,6};|(?:lt|gt|quot|amp);)/gi, "&amp;")
		.replace(/[\\`*[\]~]|(?<![\p{L}\p{N}])_|_(?![\p{L}\p{N}])/gu, "\\$&");
};

const linkedText = (text: string, href: string): JSONContent => ({
	type: "text",
	text,
	marks: [{ type: "link", attrs: { href } }],
});

// The page's CSP only loads images from its own origin, so an image from
// anywhere else becomes a link to it. While uploading, an image shows its local
// blob: preview, and a file that isn't an image shows its name.
const AttachmentImage = Image.extend({
	addAttributes() {
		return {
			...this.parent?.(),
			uploadId: { default: null, rendered: false, parseHTML: () => null },
		};
	},
	parseHTML() {
		return [{ tag: 'img[src^="/api/attachments/"]' }];
	},
	renderHTML({ node, HTMLAttributes }) {
		const { src, alt, uploadId } = node.attrs;
		if (uploadId) {
			return src
				? ["img", { src, alt, "data-uploading": "" }]
				: ["span", { "data-uploading": "" }, `Uploading ${alt}…`];
		}
		if (!isAttachmentUrl(src ?? "")) return ["span", {}, alt ?? ""];
		return ["img", { ...HTMLAttributes, loading: "lazy" }];
	},
	parseMarkdown: (token, helpers) => {
		const href: string = token.href ?? "";
		const alt: string = token.text ?? "";
		if (isAttachmentUrl(href)) {
			return helpers.createNode("image", {
				src: href,
				alt,
				title: token.title ?? null,
			});
		}
		if (isSafeHref(href)) return linkedText(alt || href, href);
		return alt ? { type: "text", text: alt } : [];
	},
	renderMarkdown: (node) => {
		const { src, alt, title, uploadId } = node.attrs ?? {};
		if (uploadId || !src) return "";
		const label = (alt ?? "").replace(/[[\]\\\n]/g, "");
		return title
			? `![${label}](${src} "${title.replace(/"/g, "")}")`
			: `![${label}](${src})`;
	},
}).configure({ inline: true });

// Paragraph lifts an image that stands alone out of its paragraph, for editors
// where images are blocks. Images are inline here, as in Markdown, so it stays.
const ImageParagraph = Paragraph.extend({
	parseMarkdown(token, helpers) {
		const tokens = token.tokens ?? [];
		if (tokens.length === 1 && tokens[0]?.type === "image") {
			return helpers.createNode(
				"paragraph",
				undefined,
				helpers.parseInline(tokens),
			);
		}
		return this.parent?.(token, helpers) ?? [];
	},
});

// Link reads any href from Markdown and only blanks a bad one when rendering,
// so without this it would be written back on save.
const SafeLink = Link.extend({
	parseMarkdown: (token, helpers) => {
		const content = helpers.parseInline(token.tokens ?? []);
		return isSafeHref(token.href)
			? helpers.applyMark("link", content, {
					href: token.href,
					title: token.title || null,
				})
			: content;
	},
});

// Descriptions are read with single newlines as line breaks, so a break is
// written back as one, and plain-text descriptions keep their exact text.
// A heading ends at a newline, so a break inside one is written as a space.
const LineBreak = HardBreak.extend({
	renderMarkdown: (_node, _helpers, context) =>
		context.parentType === "heading" ? " " : "\n",
});

// Table writes a blank line before and after itself on top of the one between
// blocks.
const MarkdownTable = Table.extend({
	renderMarkdown(node, helpers, context) {
		return this.parent?.(node, helpers, context).trim() ?? "";
	},
});

// A read-only description can't be ticked, so its checkboxes say so.
const ReadOnlyAwareTaskItem = TaskItem.extend({
	addNodeView() {
		const create = this.parent?.();
		if (!create) return null;
		return (props) => {
			const view = create(props);
			const checkbox =
				view.dom instanceof HTMLElement && view.dom.querySelector("input");
			if (checkbox) checkbox.disabled = !props.editor.isEditable;
			return view;
		};
	},
});

export function richTextExtensions({
	placeholder,
}: {
	placeholder?: string;
} = {}): AnyExtension[] {
	return [
		StarterKit.configure({
			heading: { levels: [1, 2, 3] },
			hardBreak: false,
			link: false,
			paragraph: false,
		}),
		ImageParagraph,
		SafeLink.configure({
			openOnClick: false,
			defaultProtocol: "https",
			isAllowedUri: (url) => isSafeHref(url),
			HTMLAttributes: { target: "_blank", rel: "noreferrer noopener" },
		}),
		LineBreak,
		TaskList,
		ReadOnlyAwareTaskItem.configure({
			nested: true,
			a11y: { checkboxLabel: (_, checked) => (checked ? "Done" : "Not done") },
		}),
		MarkdownTable.configure({ resizable: false }),
		TableRow,
		TableHeader,
		TableCell,
		AttachmentImage,
		Placeholder.configure({ placeholder: placeholder ?? "" }),
		Markdown.configure({ marked: htmlAsTextMarked() }),
	];
}

// Reads and writes Markdown the way the editor does, without one.
export const markdownManager = () =>
	new MarkdownManager({
		extensions: richTextExtensions(),
		marked: htmlAsTextMarked(),
	});

let reader: MarkdownManager | undefined;

// The editor's starting content, read ahead so the editor gets a document. Given
// Markdown, Tiptap swaps it for the document it reads, and then finds its
// options changed on every render.
export function parseMarkdown(markdown: string): JSONContent | string {
	reader ??= markdownManager();
	const doc = reader.parse(markdown);
	return doc.content?.length ? doc : "";
}
