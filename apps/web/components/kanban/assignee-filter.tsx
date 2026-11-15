import type { ProjectMember } from "@smelp/db";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
	Combobox,
	ComboboxTrigger,
	ComboboxValue,
} from "@ui-sdk/react/combobox";
import { useState } from "react";
import { currentUserQueryOptions } from "#/lib/auth";
import { UNASSIGNED } from "#/lib/board-filters";
import { cn } from "#/lib/utils";
import {
	MemberAvatar,
	MemberOption,
	NobodyAvatar,
	PeopleContent,
	sortMembers,
	UnassignedOption,
} from "../people/people-picker";

export function AssigneeFilter({
	value,
	members,
	onChange,
	className,
}: {
	value: string[] | undefined;
	members: ProjectMember[];
	onChange: (value: string[] | undefined) => void;
	className?: string;
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
	const selected = value ?? [];

	return (
		<Combobox
			multiple
			presentation="auto"
			value={selected}
			onValueChange={(next) =>
				onChange(next.length > 0 ? (next as string[]) : undefined)
			}
			itemToLabel={labelOf}
			query={query}
			onQueryChange={setQuery}
			onOpenChange={(open) => open && setQuery("")}
			onOpenChangeComplete={(open) => !open && button?.focus()}
		>
			<ComboboxTrigger
				ref={setButton}
				data-active={selected.length > 0 || undefined}
				className={cn("justify-between gap-2 px-2.5 font-normal", className)}
			>
				{selected.length > 0 && (
					<span aria-hidden className="flex shrink-0 -space-x-1.5">
						{selected.slice(0, 3).map((id) => {
							const member = memberById.get(id);
							const ring = "size-5 ring-2 ring-background text-[0.625rem]";
							return member ? (
								<MemberAvatar key={id} member={member} className={ring} />
							) : (
								<NobodyAvatar key={id} className={ring} />
							);
						})}
					</span>
				)}
				<span className="min-w-0 flex-1 truncate text-start">
					<span className="sr-only">Assignee: </span>
					<ComboboxValue maxLabels={1}>
						{(state) => state.label || "Anyone"}
					</ComboboxValue>
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
	);
}
