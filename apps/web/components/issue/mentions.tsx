import type { ProjectMember } from "@smelp/db";
import {
	type TriggerDefinition,
	TriggerMenu,
	TriggerMenuContent,
	TriggerMenuInput,
	TriggerMenuList,
} from "@ui-sdk/react/trigger-menu";
import { type ReactNode, useEffect, useRef } from "react";
import { cn } from "#/lib/utils";

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

// A comment box that offers project members after "@". Choosing one inserts the
// stored mention syntax rather than the name, so the id travels with it.
export function MentionTextarea({
	value,
	onValueChange,
	members,
	onSubmit,
	className,
	...props
}: Omit<
	React.ComponentProps<typeof TriggerMenuInput>,
	"value" | "defaultValue" | "onChange" | "onInput"
> & {
	value: string;
	onValueChange: (value: string) => void;
	members: ProjectMember[];
	onSubmit: () => void;
}) {
	// The trigger menu writes into the textarea itself, so it can't be a controlled
	// React input. Changes from outside, like clearing it after posting, are copied in.
	const ref = useRef<HTMLTextAreaElement>(null);
	useEffect(() => {
		if (ref.current && ref.current.value !== value) ref.current.value = value;
	}, [value]);

	const triggers: TriggerDefinition[] = [
		{
			char: "@",
			// Display names can have a space, like "Ada Lovelace".
			spaces: 2,
			items: members.map((member) => ({
				value: member.userId,
				label: member.displayName,
			})),
			insert: (item) =>
				`@[${item.label.replace(/[[\]\n]/g, "")}](user:${item.value}) `,
		},
	];

	return (
		<TriggerMenu triggers={triggers}>
			<TriggerMenuInput
				{...props}
				ref={ref}
				defaultValue={value}
				onInput={(event) => onValueChange(event.currentTarget.value)}
				onKeyDown={(event) => {
					if (
						event.key === "Enter" &&
						(event.metaKey || event.ctrlKey) &&
						!event.defaultPrevented
					) {
						event.preventDefault();
						onSubmit();
					}
				}}
				className={cn(
					"field-sizing-content min-h-20 w-full resize-none",
					className,
				)}
			/>
			<TriggerMenuContent>
				<TriggerMenuList />
			</TriggerMenuContent>
		</TriggerMenu>
	);
}
