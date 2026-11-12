import type { ProjectMember } from "@smelp/db";
import {
	type ReactNode,
	useId,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { cn } from "#/lib/utils";
import { Textarea } from "../ui/textarea";

// A mention is stored in the comment as @[Display name](user:<id>). The API reads
// the id, so renaming someone never breaks a mention. Keep in sync with
// apps/api/src/lib/mentions.ts.
const MENTION = /@\[([^\]\n]{1,80})\]\(user:([a-z0-9]{8,64})\)/g;

// The name inside a mention is never shown as written, since anyone can type
// "@[Admin](user:<someone else>)". A mention shows the current name of the project
// member its id belongs to; any other id is plain text.
export function CommentBody({
	body,
	members,
	currentUserId,
}: {
	body: string;
	members: ProjectMember[];
	currentUserId: string | undefined;
}) {
	const parts: ReactNode[] = [];
	let last = 0;
	for (const match of body.matchAll(MENTION)) {
		const start = match.index ?? 0;
		if (start > last) parts.push(body.slice(last, start));
		const member = members.find((candidate) => candidate.userId === match[2]);
		if (member) {
			parts.push(
				<span
					key={start}
					className={cn(
						"rounded-sm bg-primary/10 px-0.5 font-medium text-primary",
						member.userId === currentUserId && "bg-primary/25",
					)}
				>
					@{member.displayName}
				</span>,
			);
		} else {
			parts.push(`@${match[1]}`);
		}
		last = start + match[0].length;
	}
	if (last < body.length) parts.push(body.slice(last));
	return (
		<p className="text-sm/relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
			{parts}
		</p>
	);
}

const TRIGGER = /(^|\s)@([^\s@[\]]{0,30})$/;

// A textarea that offers project members when the text before the cursor ends
// in "@" and a few letters. Choosing one inserts the stored mention syntax.
export function MentionTextarea({
	value,
	onValueChange,
	members,
	onSubmit,
	...props
}: Omit<React.ComponentProps<typeof Textarea>, "value" | "onChange"> & {
	value: string;
	onValueChange: (value: string) => void;
	members: ProjectMember[];
	onSubmit: () => void;
}) {
	const ref = useRef<HTMLTextAreaElement>(null);
	const pendingCaret = useRef<number | null>(null);
	const listId = useId();
	const [caret, setCaret] = useState(0);
	const [dismissed, setDismissed] = useState(false);
	const [highlighted, setHighlighted] = useState(0);

	const trigger = TRIGGER.exec(value.slice(0, caret));
	const query = trigger?.[2]?.toLowerCase() ?? "";
	const options =
		trigger && !dismissed
			? members
					.filter((member) => member.displayName.toLowerCase().includes(query))
					.slice(0, 6)
			: [];
	const isOpen = options.length > 0;

	const choose = (member: ProjectMember) => {
		if (!trigger) return;
		const queryStart = caret - trigger[2].length - 1;
		const name = member.displayName.replace(/[[\]\n]/g, "");
		const inserted = `@[${name}](user:${member.userId}) `;
		const next = value.slice(0, queryStart) + inserted + value.slice(caret);
		const position = queryStart + inserted.length;
		pendingCaret.current = position;
		onValueChange(next);
		setCaret(position);
	};

	// Put the cursor after the inserted mention as soon as React has written the new
	// text, before the next key is handled. Waiting a frame let fast typing land
	// first and then moved the cursor back into the middle of it.
	useLayoutEffect(() => {
		const position = pendingCaret.current;
		if (position === null || !ref.current) return;
		pendingCaret.current = null;
		ref.current.focus();
		ref.current.setSelectionRange(position, position);
	});

	return (
		<div className="relative">
			<Textarea
				{...props}
				ref={ref}
				value={value}
				role="combobox"
				aria-expanded={isOpen}
				aria-controls={isOpen ? listId : undefined}
				aria-autocomplete="list"
				onChange={(event) => {
					onValueChange(event.target.value);
					setCaret(event.target.selectionStart);
					setDismissed(false);
					setHighlighted(0);
				}}
				onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
				onKeyDown={(event) => {
					if (isOpen) {
						const choice = options[highlighted];
						if (event.key === "ArrowDown" || event.key === "ArrowUp") {
							event.preventDefault();
							const step = event.key === "ArrowDown" ? 1 : -1;
							setHighlighted(
								(highlighted + step + options.length) % options.length,
							);
							return;
						}
						if ((event.key === "Enter" || event.key === "Tab") && choice) {
							event.preventDefault();
							choose(choice);
							return;
						}
						if (event.key === "Escape") {
							event.preventDefault();
							setDismissed(true);
							return;
						}
					}
					if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
						event.preventDefault();
						onSubmit();
					}
				}}
			/>
			{isOpen && (
				<div
					id={listId}
					role="listbox"
					aria-label="Mention a project member"
					className="absolute z-10 mt-1 max-h-48 w-64 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
				>
					{options.map((member, index) => (
						<div
							key={member.userId}
							role="option"
							tabIndex={-1}
							aria-selected={index === highlighted}
							className={cn(
								"cursor-pointer rounded-sm px-2 py-1 text-xs [overflow-wrap:anywhere]",
								index === highlighted && "bg-accent text-accent-foreground",
							)}
							// Keeps focus in the textarea, so the click doesn't close the list first.
							onMouseDown={(event) => {
								event.preventDefault();
								choose(member);
							}}
						>
							{member.displayName}
						</div>
					))}
				</div>
			)}
		</div>
	);
}
