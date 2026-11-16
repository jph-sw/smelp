import {
	CheckListIcon,
	Heading01Icon,
	Heading02Icon,
	Heading03Icon,
	Image01Icon,
	LeftToRightListBulletIcon,
	LeftToRightListNumberIcon,
	Link01Icon,
	MinusSignIcon,
	QuoteDownIcon,
	SourceCodeIcon,
	Table01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { type Editor, Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { Suggestion } from "@tiptap/suggestion";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createStore, type StoreApi, useStore } from "zustand";
import { isSafeHref } from "./extensions";

// What a command can ask of the editor around it: a file picker for images,
// and a field for the address of a link.
export type SlashActions = {
	pickImages: () => void;
	askForLink: () => void;
};

type SlashCommand = {
	value: string;
	label: string;
	keywords: string[];
	icon: IconSvgElement;
	// Uploads go to a work item, so the create dialog has nowhere to put one.
	needsUploads?: true;
	run: (editor: Editor, actions: SlashActions) => void;
};

const SLASH_COMMANDS: SlashCommand[] = [
	{
		value: "h1",
		label: "Heading 1",
		keywords: ["title", "h1"],
		icon: Heading01Icon,
		run: (editor) => editor.chain().focus().setHeading({ level: 1 }).run(),
	},
	{
		value: "h2",
		label: "Heading 2",
		keywords: ["subtitle", "h2"],
		icon: Heading02Icon,
		run: (editor) => editor.chain().focus().setHeading({ level: 2 }).run(),
	},
	{
		value: "h3",
		label: "Heading 3",
		keywords: ["h3"],
		icon: Heading03Icon,
		run: (editor) => editor.chain().focus().setHeading({ level: 3 }).run(),
	},
	{
		value: "bulleted-list",
		label: "Bulleted list",
		keywords: ["unordered", "ul", "bullet"],
		icon: LeftToRightListBulletIcon,
		run: (editor) => editor.chain().focus().toggleBulletList().run(),
	},
	{
		value: "numbered-list",
		label: "Numbered list",
		keywords: ["ordered", "ol"],
		icon: LeftToRightListNumberIcon,
		run: (editor) => editor.chain().focus().toggleOrderedList().run(),
	},
	{
		value: "checklist",
		label: "Checklist",
		keywords: ["todo", "task", "checkbox"],
		icon: CheckListIcon,
		run: (editor) => editor.chain().focus().toggleTaskList().run(),
	},
	{
		value: "quote",
		label: "Quote",
		keywords: ["blockquote"],
		icon: QuoteDownIcon,
		run: (editor) => editor.chain().focus().toggleBlockquote().run(),
	},
	{
		value: "code",
		label: "Code block",
		keywords: ["snippet", "pre"],
		icon: SourceCodeIcon,
		run: (editor) => editor.chain().focus().toggleCodeBlock().run(),
	},
	{
		value: "divider",
		label: "Divider",
		keywords: ["hr", "rule", "separator", "line"],
		icon: MinusSignIcon,
		run: (editor) => editor.chain().focus().setHorizontalRule().run(),
	},
	{
		value: "table",
		label: "Table",
		keywords: ["grid", "columns"],
		icon: Table01Icon,
		run: (editor) =>
			editor
				.chain()
				.focus()
				.insertTable({ rows: 3, cols: 3, withHeaderRow: true })
				.run(),
	},
	{
		value: "link",
		label: "Link",
		keywords: ["url", "href"],
		icon: Link01Icon,
		run: (_, actions) => actions.askForLink(),
	},
	{
		value: "image",
		label: "Image",
		keywords: ["picture", "photo", "screenshot", "upload", "file"],
		icon: Image01Icon,
		needsUploads: true,
		run: (_, actions) => actions.pickImages(),
	},
];

// The menu lists commands while "/" is being typed, then may ask for a link's
// address at the same spot.
type SlashMenuState =
	| { mode: "closed" }
	| {
			mode: "commands";
			items: SlashCommand[];
			active: number;
			rect: DOMRect | null;
			choose: (command: SlashCommand) => void;
	  }
	| { mode: "link"; rect: DOMRect | null; at: number; text: string };

export type SlashMenuStore = StoreApi<SlashMenuState>;

export const createSlashMenuStore = () =>
	createStore<SlashMenuState>(() => ({ mode: "closed" }));

const matches = (command: SlashCommand, query: string) => {
	const q = query.toLowerCase();
	return [command.label, ...command.keywords].some((word) =>
		word.toLowerCase().includes(q),
	);
};

export function slashCommands({
	store,
	uploads,
	actions,
}: {
	store: SlashMenuStore;
	uploads: boolean;
	actions: () => SlashActions;
}) {
	const available = SLASH_COMMANDS.filter(
		(command) => uploads || !command.needsUploads,
	);
	const move = (by: number) => {
		const state = store.getState();
		if (state.mode !== "commands" || state.items.length === 0) return false;
		const count = state.items.length;
		store.setState({ ...state, active: (state.active + by + count) % count });
		return true;
	};

	return Extension.create({
		name: "slashCommands",
		addProseMirrorPlugins() {
			return [
				Suggestion<SlashCommand, SlashCommand>({
					editor: this.editor,
					pluginKey: new PluginKey("slashCommands"),
					char: "/",
					allow: ({ state, range }) =>
						!state.doc.resolve(range.from).parent.type.spec.code,
					items: ({ query }) =>
						available.filter((command) => matches(command, query)),
					command: ({ editor, range, props: command }) => {
						editor.chain().focus().deleteRange(range).run();
						command.run(editor, actions());
					},
					render: () => {
						const show = (props: {
							items: SlashCommand[];
							clientRect?: (() => DOMRect | null) | null;
							command: (command: SlashCommand) => void;
						}) => {
							const previous = store.getState();
							store.setState({
								mode: "commands",
								items: props.items,
								active:
									previous.mode === "commands" &&
									previous.items.length === props.items.length
										? previous.active
										: 0,
								rect: props.clientRect?.() ?? null,
								choose: props.command,
							});
						};
						return {
							onStart: show,
							onUpdate: show,
							onExit: () => {
								if (store.getState().mode === "commands") {
									store.setState({ mode: "closed" });
								}
							},
							onKeyDown: ({ event }) => {
								const state = store.getState();
								if (state.mode !== "commands") return false;
								if (event.key === "ArrowDown") return move(1);
								if (event.key === "ArrowUp") return move(-1);
								if (event.key === "Enter" || event.key === "Tab") {
									const command = state.items[state.active];
									if (!command) return false;
									state.choose(command);
									return true;
								}
								if (event.key === "Escape") {
									// Only the menu closes: not the dialog around it, and the
									// description keeps what was typed.
									event.stopPropagation();
									store.setState({ mode: "closed" });
									return true;
								}
								return false;
							},
						};
					},
				}),
			];
		},
	});
}

export const isSlashMenuOpen = (store: SlashMenuStore) =>
	store.getState().mode !== "closed";

// Opens the link field where the caret is, with the selected text, if any, as
// the link's text.
export function askForLink(editor: Editor, store: SlashMenuStore) {
	const { from, to } = editor.state.selection;
	const coords = editor.view.coordsAtPos(from);
	store.setState({
		mode: "link",
		at: from,
		text: editor.state.doc.textBetween(from, to),
		rect: new DOMRect(coords.left, coords.top, 0, coords.bottom - coords.top),
	});
	if (to > from) editor.commands.deleteRange({ from, to });
}

function insertLink(editor: Editor, at: number, text: string, href: string) {
	editor
		.chain()
		.focus()
		.insertContentAt(at, {
			type: "text",
			text: text || href,
			marks: [{ type: "link", attrs: { href } }],
		})
		.unsetMark("link")
		.run();
}

// Fixed to the caret, in the top layer, so a dialog around the editor neither
// clips nor covers it.
function useCaretPosition(rect: DOMRect | null) {
	const ref = useRef<HTMLDivElement>(null);
	const [style, setStyle] = useState<React.CSSProperties>({
		visibility: "hidden",
	});
	useLayoutEffect(() => {
		const popup = ref.current;
		if (!popup || !rect) return;
		if (!popup.matches(":popover-open")) popup.showPopover();
		const gap = 4;
		const below = rect.bottom + gap;
		const fitsBelow = below + popup.offsetHeight <= window.innerHeight;
		setStyle({
			position: "fixed",
			inset: "auto",
			top: fitsBelow
				? below
				: Math.max(gap, rect.top - gap - popup.offsetHeight),
			left: Math.min(rect.left, window.innerWidth - popup.offsetWidth - gap),
			"--available-height": `${Math.max(below, window.innerHeight - below) - gap * 2}px`,
		} as React.CSSProperties);
	}, [rect]);
	return { ref, style };
}

export function SlashMenu({
	editor,
	store,
}: {
	editor: Editor;
	store: SlashMenuStore;
}) {
	const state = useStore(store);
	if (state.mode === "commands" && state.items.length > 0) {
		return <CommandList editor={editor} state={state} store={store} />;
	}
	if (state.mode === "link") {
		return <LinkField editor={editor} state={state} store={store} />;
	}
	return null;
}

function CommandList({
	editor,
	state,
	store,
}: {
	editor: Editor;
	state: Extract<SlashMenuState, { mode: "commands" }>;
	store: SlashMenuStore;
}) {
	const id = useId();
	const { ref, style } = useCaretPosition(state.rect);
	const optionId = (command: SlashCommand) => `${id}-${command.value}`;
	const active = state.items[state.active];

	// Focus stays in the editor, so it carries the combobox wiring that points
	// screen readers at the highlighted command.
	useEffect(() => {
		const field = editor.view.dom;
		field.setAttribute("aria-controls", id);
		field.setAttribute("aria-expanded", "true");
		return () => {
			field.removeAttribute("aria-controls");
			field.removeAttribute("aria-activedescendant");
			field.setAttribute("aria-expanded", "false");
		};
	}, [editor, id]);
	useEffect(() => {
		if (active) {
			editor.view.dom.setAttribute("aria-activedescendant", optionId(active));
			document
				.getElementById(optionId(active))
				?.scrollIntoView({ block: "nearest" });
		}
	});

	return (
		<div
			ref={ref}
			popover="manual"
			data-slot="trigger-menu-content"
			data-open=""
			data-has-icons=""
			style={style}
		>
			<div id={id} role="listbox" aria-label="Commands">
				{state.items.map((command, index) => (
					<div
						key={command.value}
						id={optionId(command)}
						role="option"
						tabIndex={-1}
						aria-selected={index === state.active}
						data-slot="trigger-menu-item"
						data-has-icon=""
						data-highlighted={index === state.active ? "" : undefined}
						onMouseDown={(event) => event.preventDefault()}
						onMouseMove={() => {
							if (index !== state.active)
								store.setState({ ...state, active: index });
						}}
						onClick={() => state.choose(command)}
					>
						<HugeiconsIcon
							icon={command.icon}
							className="size-4 shrink-0 text-muted-foreground"
						/>
						{command.label}
					</div>
				))}
			</div>
		</div>
	);
}

function LinkField({
	editor,
	state,
	store,
}: {
	editor: Editor;
	state: Extract<SlashMenuState, { mode: "link" }>;
	store: SlashMenuStore;
}) {
	const { ref, style } = useCaretPosition(state.rect);
	const [href, setHref] = useState("");
	const [invalid, setInvalid] = useState(false);
	const close = () => {
		store.setState({ mode: "closed" });
		editor.commands.focus(state.at);
	};

	return (
		<div
			ref={ref}
			popover="manual"
			data-slot="trigger-menu-content"
			data-open=""
			style={style}
		>
			<input
				autoFocus
				type="url"
				aria-label="Link address"
				aria-invalid={invalid || undefined}
				placeholder="Paste a link and press Enter"
				value={href}
				className="h-7 w-64 rounded-sm bg-transparent px-2 text-sm outline-none"
				onChange={(event) => {
					setHref(event.target.value);
					setInvalid(false);
				}}
				onBlur={(event) => {
					if (
						!event.currentTarget
							.closest("[popover]")
							?.contains(event.relatedTarget)
					) {
						store.setState({ mode: "closed" });
					}
				}}
				onKeyDown={(event) => {
					if (event.key === "Escape") {
						event.preventDefault();
						event.stopPropagation();
						close();
					}
					if (event.key === "Enter") {
						event.preventDefault();
						event.stopPropagation();
						const url = href.trim();
						if (!url) return close();
						if (!isSafeHref(url)) return setInvalid(true);
						store.setState({ mode: "closed" });
						insertLink(editor, state.at, state.text, url);
					}
				}}
			/>
		</div>
	);
}
