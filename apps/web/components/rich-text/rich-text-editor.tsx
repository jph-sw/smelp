import type { ProjectMember } from "@smelp/db";
import {
	keepPreviousData,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { EditorContent, type UseEditorOptions, useEditor } from "@tiptap/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDebounce } from "#/hooks/use-debounce";
import { attachmentUrl } from "#/lib/attachment-url";
import {
	AttachmentUploadError,
	attachmentLimitsQueryOptions,
	attachmentsQueryOptions,
	uploadAttachment,
	workItemKeyLinksQueryOptions,
} from "#/lib/data/issue";
import { toastError } from "#/lib/errors";
import { cn } from "#/lib/utils";
import { formatBytes } from "../issue/attachments";
import { toast } from "../ui/toast";
import {
	parseMarkdown,
	refreshWorkItemKeyLinks,
	richTextExtensions,
	WorkItemKeys,
} from "./extensions";
import {
	askForLink,
	createSlashMenuStore,
	isSlashMenuOpen,
	mentionSuggestions,
	SlashMenu,
	slashCommands,
} from "./slash-menu";

// Keep in sync with INLINE_TYPES in apps/api/src/lib/attachments.ts: other files
// download instead of showing, so they go in as a link.
const INLINE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

// Keep in sync with RESOLVE_KEYS_LIMIT in apps/api/src/routes/issues.ts.
const MAX_RESOLVED_KEYS = 100;

const isModEnter = (event: KeyboardEvent) =>
	event.key === "Enter" && (event.metaKey || event.ctrlKey);

// A trailing empty block, like an unused list item, leaves blank lines at the end.
const toMarkdown = (editor: Editor) => editor.getMarkdown().replace(/\n+$/, "");

function findUpload(editor: Editor, uploadId: string) {
	let found: number | null = null;
	editor.state.doc.descendants((node, pos) => {
		if (node.attrs.uploadId === uploadId) found = pos;
		return found === null;
	});
	return found;
}

// Edits a Markdown string as rich text. Read-only with `editable={false}`.
//
// With `onCommit`, it edits in place: leaving it or Ctrl+Enter hands back the
// Markdown when it changed, and Escape goes back to the last committed value.
// Without, it reports every change through `onChange`, as in a form, and
// Ctrl+Enter and Escape call `onSubmit` and `onCancel`.
//
// With `mentions`, "@" offers those project members, and mentions show their
// current names.
//
// Work item keys in the text link to their items, for those the viewer can read.
//
// With an `issueId`, pasted, dropped and picked files are uploaded to that work
// item and inserted at the caret.
export function RichTextEditor({
	value,
	editable = true,
	issueId,
	placeholder,
	onChange,
	onCommit,
	onSubmit,
	onCancel,
	mentions,
	autoFocus = false,
	className,
	...aria
}: {
	value: string;
	editable?: boolean;
	issueId?: string;
	placeholder?: string;
	onChange?: (markdown: string) => void;
	onCommit?: (markdown: string) => void;
	onSubmit?: () => void;
	onCancel?: () => void;
	mentions?: { members: ProjectMember[]; currentUserId: string | undefined };
	autoFocus?: boolean;
	className?: string;
	"aria-label"?: string;
	"aria-labelledby"?: string;
	"aria-describedby"?: string;
}) {
	const wrapper = useRef<HTMLDivElement>(null);
	const picker = useRef<HTMLInputElement>(null);
	const queryClient = useQueryClient();
	const { data: limits } = useQuery({
		...attachmentLimitsQueryOptions,
		enabled: issueId !== undefined,
	});
	const [store] = useState(createSlashMenuStore);
	// Absent outside a router, as in tests that render the editor alone.
	const router = useRouter({ warn: false });

	const [workItemKeys, setWorkItemKeys] = useState<string[]>([]);
	const debouncedKeys = useDebounce(workItemKeys, 300);
	// Only typing needs the wait: read-only text shows its links right away.
	const keysToResolve = editable ? debouncedKeys : workItemKeys;
	const { data: keyLinks } = useQuery({
		...workItemKeyLinksQueryOptions({
			keys: keysToResolve.slice(0, MAX_RESOLVED_KEYS),
		}),
		placeholderData: keepPreviousData,
	});
	const keyLinksById = useMemo(
		() => new Map(keyLinks?.map((link) => [link.id, link])),
		[keyLinks],
	);

	// The editor is made once, so its handlers read these through a ref.
	const latest = useRef({
		value,
		issueId,
		limits,
		onChange,
		onCommit,
		onSubmit,
		onCancel,
		mentions,
		keyLinksById,
	});
	latest.current = {
		value,
		issueId,
		limits,
		onChange,
		onCommit,
		onSubmit,
		onCancel,
		mentions,
		keyLinksById,
	};
	// What the editor last showed or reported, so a `value` that only echoes it
	// back doesn't reset the content and the caret.
	const known = useRef(value);
	// The last committed value as the editor writes it, to tell whether anything
	// changed: an old description can be written a little differently.
	const committed = useRef("");
	const uploads = useRef({ pending: 0, commitWhenDone: false });

	const commit = (editor: Editor) => {
		const { onCommit } = latest.current;
		if (!onCommit) return;
		if (uploads.current.pending > 0) {
			uploads.current.commitWhenDone = true;
			return;
		}
		const markdown = toMarkdown(editor);
		if (markdown === committed.current) return;
		committed.current = markdown;
		known.current = markdown;
		onCommit(markdown);
	};

	const upload = async (editor: Editor, file: File, issueId: string) => {
		const uploadId = crypto.randomUUID();
		const preview = INLINE_IMAGE_TYPES.has(file.type)
			? URL.createObjectURL(file)
			: null;
		editor
			.chain()
			.focus()
			.insertContent({
				type: "image",
				attrs: { src: preview, alt: file.name, uploadId },
			})
			.run();
		const settle = (replace: (from: number) => void) => {
			const at = findUpload(editor, uploadId);
			if (at !== null) replace(at);
		};
		try {
			const attachment = await uploadAttachment({ issueId, file });
			const src = attachmentUrl(attachment.id);
			settle((at) => {
				const { tr, schema } = editor.state;
				const node = INLINE_IMAGE_TYPES.has(attachment.contentType)
					? schema.nodes.image.create({ src, alt: attachment.name })
					: schema.text(attachment.name, [
							schema.marks.link.create({ href: src }),
						]);
				editor.view.dispatch(
					tr.replaceWith(at, at + 1, node).setMeta("addToHistory", false),
				);
			});
		} catch (error) {
			settle((at) =>
				editor.view.dispatch(
					editor.state.tr.delete(at, at + 1).setMeta("addToHistory", false),
				),
			);
			if (error instanceof AttachmentUploadError) {
				toast({ type: "error", description: error.message });
			} else {
				toastError(error);
			}
		} finally {
			if (preview) URL.revokeObjectURL(preview);
		}
	};

	const uploadFiles = async (editor: Editor, files: File[]) => {
		const { issueId, limits } = latest.current;
		if (!issueId) {
			toast({
				type: "info",
				description: "Images can be added once the work item is created.",
			});
			return;
		}
		// Said here, in words, instead of after a long upload that is refused.
		const maxBytes = limits?.maxBytes ?? Number.POSITIVE_INFINITY;
		for (const file of files.filter((file) => file.size > maxBytes)) {
			toast({
				type: "error",
				description: `${file.name} is too large. The limit is ${formatBytes(maxBytes)}.`,
			});
		}
		const allowed = files.filter((file) => file.size <= maxBytes);
		if (allowed.length === 0) return;
		uploads.current.pending += allowed.length;
		await Promise.all(allowed.map((file) => upload(editor, file, issueId)));
		queryClient.invalidateQueries({
			queryKey: attachmentsQueryOptions({ issueId }).queryKey,
		});
		// The upload shows in the work item's history.
		queryClient.invalidateQueries({ queryKey: ["activity", issueId] });
		uploads.current.pending -= allowed.length;
		if (uploads.current.pending === 0 && uploads.current.commitWhenDone) {
			uploads.current.commitWhenDone = false;
			if (!editor.isFocused) commit(editor);
		}
	};

	// Made once: Tiptap compares the options on every render and reconfigures the
	// view when they differ. The handlers read the editor through this ref.
	const editorRef = useRef<Editor | null>(null);
	const [options] = useState(
		(): UseEditorOptions => ({
			editable,
			autofocus: autoFocus && "end",
			content: parseMarkdown(value),
			extensions: [
				...richTextExtensions({
					placeholder,
					mentionLookup: (id) => {
						const { mentions } = latest.current;
						const member = mentions?.members.find((m) => m.userId === id);
						return (
							member && {
								name: member.displayName,
								self: member.userId === mentions?.currentUserId,
							}
						);
					},
				}),
				WorkItemKeys.configure({
					lookup: (key) => latest.current.keyLinksById.get(key),
					// The view is created while this component renders.
					onKeys: (keys) => queueMicrotask(() => setWorkItemKeys(keys)),
					navigate: (href) => router.navigate({ href }),
				}),
				...(mentions
					? [
							mentionSuggestions({
								store,
								people: () =>
									(latest.current.mentions?.members ?? []).map((member) => ({
										value: member.userId,
										label: member.displayName,
									})),
							}),
						]
					: []),
				slashCommands({
					store,
					uploads: issueId !== undefined,
					actions: () => ({
						pickImages: () => picker.current?.click(),
						askForLink: () => {
							if (editorRef.current) askForLink(editorRef.current, store);
						},
					}),
				}),
			],
			editorProps: {
				attributes: editable
					? {
							role: "textbox",
							"aria-multiline": "true",
							...aria,
							class: "rich-text min-h-24 outline-none",
						}
					: { role: "group", ...aria, class: "rich-text" },
				// ProseMirror marks every Escape as handled, which hides it from a
				// dialog around the editor. Without a use for it here, it passes by.
				handleDOMEvents: {
					keydown: (_view, event) => {
						const { onCommit, onCancel } = latest.current;
						return (
							event.key === "Escape" &&
							!onCommit &&
							!onCancel &&
							!isSlashMenuOpen(store)
						);
					},
				},
				handleKeyDown: (view, event) => {
					const editor = editorRef.current;
					const { onCommit, onSubmit, onCancel } = latest.current;
					if (!editor || isSlashMenuOpen(store)) return false;
					if (event.key === "Escape" && onCancel) {
						event.preventDefault();
						onCancel();
						return true;
					}
					if (isModEnter(event) && onSubmit) {
						event.preventDefault();
						onSubmit();
						return true;
					}
					if (!onCommit) return false;
					if (event.key === "Escape") {
						event.preventDefault();
						editor.commands.setContent(latest.current.value, {
							contentType: "markdown",
							emitUpdate: false,
						});
						known.current = latest.current.value;
						committed.current = toMarkdown(editor);
						view.dom.blur();
						return true;
					}
					if (isModEnter(event)) {
						event.preventDefault();
						view.dom.blur();
						return true;
					}
					return false;
				},
				// A plain click places the caret, so a link opens with Ctrl or Cmd.
				// Read-only, the browser follows the link itself.
				handleClick: (view, _pos, event) => {
					const link = (event.target as HTMLElement).closest("a[href]");
					if (!view.editable || !link || !(event.metaKey || event.ctrlKey)) {
						return false;
					}
					window.open(link.getAttribute("href") ?? "", "_blank", "noopener");
					return true;
				},
				handlePaste: (_view, event) => {
					const editor = editorRef.current;
					const files = Array.from(event.clipboardData?.files ?? []);
					if (files.length === 0 || !editor) return false;
					uploadFiles(editor, files);
					return true;
				},
				handleDrop: (view, event, _slice, moved) => {
					const editor = editorRef.current;
					const files = Array.from(event.dataTransfer?.files ?? []);
					if (moved || files.length === 0 || !editor) return false;
					event.preventDefault();
					const at = view.posAtCoords({
						left: event.clientX,
						top: event.clientY,
					});
					if (at) {
						view.dispatch(
							view.state.tr.setSelection(
								TextSelection.create(view.state.doc, at.pos),
							),
						);
					}
					uploadFiles(editor, files);
					return true;
				},
			},
			onCreate: ({ editor }) => {
				committed.current = toMarkdown(editor);
			},
			onUpdate: ({ editor }) => {
				const { onChange } = latest.current;
				if (!onChange) return;
				const markdown = toMarkdown(editor);
				known.current = markdown;
				onChange(markdown);
			},
		}),
	);
	const editor = useEditor(options);
	editorRef.current = editor;

	// A new value from outside, like a save from another tab, shows unless
	// someone is typing.
	useEffect(() => {
		if (!editor || value === known.current || editor.isFocused) return;
		editor.commands.setContent(value, {
			contentType: "markdown",
			emitUpdate: false,
		});
		known.current = value;
		committed.current = toMarkdown(editor);
	}, [editor, value]);

	useEffect(() => {
		if (!editor || editor.isDestroyed || !keyLinks) return;
		refreshWorkItemKeyLinks(editor.view);
	}, [editor, keyLinks]);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: listens for focus leaving the editor and its link field, which bubbles here
		<div
			ref={wrapper}
			className={cn("relative", className)}
			onBlur={(event) => {
				if (!editor || !onCommit) return;
				const inside = (node: Node | null) =>
					node !== null && !!wrapper.current?.contains(node);
				// Focus moved into the link field, or the window lost focus, as when
				// the file picker opens, and comes back here.
				if (inside(event.relatedTarget) || inside(document.activeElement)) {
					return;
				}
				commit(editor);
			}}
		>
			<EditorContent editor={editor} />
			{editor && editable && <SlashMenu editor={editor} store={store} />}
			{issueId && editable && (
				<input
					ref={picker}
					type="file"
					accept={[...INLINE_IMAGE_TYPES].join(",")}
					multiple
					hidden
					aria-label="Upload images"
					onChange={(event) => {
						const files = Array.from(event.target.files ?? []);
						event.target.value = "";
						if (editor) uploadFiles(editor, files);
					}}
				/>
			)}
		</div>
	);
}
