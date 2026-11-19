import type { ProjectMember } from "@smelp/db";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Combobox, ComboboxTrigger } from "@ui-sdk/react/combobox";
import { useState } from "react";
import { currentUserQueryOptions } from "#/lib/auth";
import { cn } from "#/lib/utils";
import {
	MemberAvatar,
	MemberOption,
	NobodyAvatar,
	PeopleContent,
	sortMembers,
	UnassignedOption,
} from "../people/people-picker";
import { Button } from "../ui/button";

const UNASSIGNED = "unassigned";

export function AssigneeSelect({
	value,
	members,
	disabled,
	className,
	offerSelf,
	onChange,
}: {
	value: string | null;
	members: ProjectMember[];
	disabled?: boolean;
	className?: string;
	offerSelf?: boolean;
	onChange: (value: string | null) => void;
}) {
	const { data: user } = useSuspenseQuery(currentUserQueryOptions);
	const [button, setButton] = useState<HTMLButtonElement | null>(null);
	const [query, setQuery] = useState("");

	const people = sortMembers(members, user?.id);
	const memberById = new Map(members.map((member) => [member.userId, member]));
	const labelOf = (id: string) =>
		id === UNASSIGNED
			? "Unassigned"
			: (memberById.get(id)?.displayName ?? "Former member");
	const selected = value === null ? undefined : memberById.get(value);
	const canTakeOver =
		offerSelf && user && value !== user.id && memberById.has(user.id);

	return (
		<>
			<Combobox
				presentation="auto"
				disabled={disabled}
				value={value ?? UNASSIGNED}
				onValueChange={(next) =>
					next != null && onChange(next === UNASSIGNED ? null : next)
				}
				itemToLabel={labelOf}
				query={query}
				onQueryChange={setQuery}
				onOpenChange={(open) => open && setQuery("")}
				// In a dialog, ui-sdk's own restore runs right after this and picks the
				// dialog's first field, because the input, not this button, is the trigger.
				onOpenChangeComplete={(open) =>
					!open && requestAnimationFrame(() => button?.focus())
				}
			>
				<ComboboxTrigger
					ref={setButton}
					className={cn("min-w-0 justify-between gap-2", className)}
				>
					<span aria-hidden className="flex shrink-0">
						{selected ? (
							<MemberAvatar
								member={selected}
								className="size-5 text-[0.625rem]"
							/>
						) : (
							<NobodyAvatar className="size-5" />
						)}
					</span>
					<span className="min-w-0 flex-1 truncate text-start">
						<span className="sr-only">Assignee: </span>
						{labelOf(value ?? UNASSIGNED)}
					</span>
				</ComboboxTrigger>
				<PeopleContent anchor={button}>
					<UnassignedOption value={UNASSIGNED} />
					{people.map((member) => (
						<MemberOption
							key={member.userId}
							member={member}
							isCurrentUser={member.userId === user?.id}
						/>
					))}
				</PeopleContent>
			</Combobox>
			{canTakeOver && (
				<Button
					type="button"
					variant="link"
					size="xs"
					className="w-fit shrink-0"
					onClick={() => {
						onChange(user.id);
						// This link unmounts once you're the assignee, which drops focus to the body.
						button?.focus();
					}}
				>
					Assign to me
				</Button>
			)}
		</>
	);
}
