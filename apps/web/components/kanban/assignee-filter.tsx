import { Search01Icon, UserIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ProjectMember } from "@smelp/db";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
	Combobox,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
	ComboboxItemIcon,
	ComboboxItemIndicator,
	ComboboxItemText,
	ComboboxList,
	ComboboxTrigger,
	ComboboxValue,
} from "@ui-sdk/react/combobox";
import { useState } from "react";
import { currentUserQueryOptions } from "#/lib/auth";
import { UNASSIGNED } from "#/lib/board-filters";
import { cn, initials } from "#/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";

function NobodyAvatar({ className }: { className?: string }) {
	return (
		<span
			className={cn(
				"flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground/60 bg-background text-muted-foreground",
				className,
			)}
		>
			<HugeiconsIcon icon={UserIcon} aria-hidden className="size-3.5" />
		</span>
	);
}

function MemberAvatar({
	member,
	className,
}: {
	member: ProjectMember;
	className?: string;
}) {
	return (
		<Avatar size="sm" className={className}>
			<AvatarImage src={member.image ?? undefined} alt="" />
			<AvatarFallback>{initials(member.displayName)}</AvatarFallback>
		</Avatar>
	);
}

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

	const people = [...members].sort((a, b) =>
		a.userId === user?.id
			? -1
			: b.userId === user?.id
				? 1
				: a.displayName.localeCompare(b.displayName),
	);
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
				aria-label="Filter by assignee"
				data-active={selected.length > 0 || undefined}
				className={cn("justify-between gap-2 px-2.5 font-normal", className)}
			>
				{selected.length > 0 && (
					<span className="flex shrink-0 -space-x-1.5">
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
					<ComboboxValue maxLabels={1}>
						{(state) => state.label || "Anyone"}
					</ComboboxValue>
				</span>
			</ComboboxTrigger>
			<ComboboxContent
				anchor={button}
				sideOffset={4}
				className="w-72 data-[presentation=sheet]:h-[70dvh] data-[presentation=sheet]:w-full [&_[data-slot=combobox-header]]:border-b [&_[data-slot=combobox-header]]:px-2"
			>
				{/* A sheet moves the input into its own header and leaves this row behind. */}
				<div className="flex items-center gap-2 border-b px-2 pb-1 in-data-[presentation=sheet]:hidden">
					<HugeiconsIcon
						icon={Search01Icon}
						aria-hidden
						className="size-4 shrink-0 text-muted-foreground"
					/>
					<ComboboxInput
						autoFocus
						aria-label="Search people"
						placeholder="Search people…"
						className="h-8 w-full min-w-0 border-0 bg-transparent px-0 shadow-none focus:outline-none"
					/>
				</div>
				<ComboboxEmpty>No people found.</ComboboxEmpty>
				<ComboboxList className="pt-1">
					<ComboboxItem value={UNASSIGNED} label="Unassigned">
						<ComboboxItemIcon>
							<NobodyAvatar />
						</ComboboxItemIcon>
						<ComboboxItemText className="min-w-0 flex-1 truncate" />
						<ComboboxItemIndicator />
					</ComboboxItem>
					{people.map((member) => (
						<ComboboxItem
							key={member.userId}
							value={member.userId}
							label={member.displayName}
							keywords={[member.fullName, member.email].filter(
								(word): word is string => Boolean(word),
							)}
						>
							<ComboboxItemIcon>
								<MemberAvatar member={member} />
							</ComboboxItemIcon>
							<span className="min-w-0 flex-1 py-1">
								<span className="flex min-w-0 gap-1">
									<ComboboxItemText className="truncate" />
									{member.userId === user?.id && (
										<span className="shrink-0 text-muted-foreground">
											(you)
										</span>
									)}
								</span>
								<span className="block truncate text-xs text-muted-foreground">
									{member.email}
								</span>
							</span>
							<ComboboxItemIndicator />
						</ComboboxItem>
					))}
				</ComboboxList>
			</ComboboxContent>
		</Combobox>
	);
}
