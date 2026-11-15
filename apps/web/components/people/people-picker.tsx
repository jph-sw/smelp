import { Search01Icon, UserIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ProjectMember } from "@smelp/db";
import {
	ComboboxContent,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
	ComboboxItemIcon,
	ComboboxItemIndicator,
	ComboboxItemText,
	ComboboxList,
} from "@ui-sdk/react/combobox";
import type { ReactNode } from "react";
import { cn, initials } from "#/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";

export function NobodyAvatar({ className }: { className?: string }) {
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

export function MemberAvatar({
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

export function sortMembers(
	members: ProjectMember[],
	currentUserId: string | undefined,
) {
	return [...members].sort(
		(a, b) =>
			Number(b.userId === currentUserId) - Number(a.userId === currentUserId) ||
			a.displayName.localeCompare(b.displayName),
	);
}

export function UnassignedOption({ value }: { value: string }) {
	return (
		<ComboboxItem value={value} label="Unassigned">
			<ComboboxItemIcon>
				<NobodyAvatar />
			</ComboboxItemIcon>
			<ComboboxItemText className="min-w-0 flex-1 truncate" />
			<ComboboxItemIndicator />
		</ComboboxItem>
	);
}

export function MemberOption({
	member,
	isCurrentUser,
}: {
	member: ProjectMember;
	isCurrentUser: boolean;
}) {
	return (
		<ComboboxItem
			value={member.userId}
			label={member.displayName}
			keywords={[member.fullName, member.email].filter((word): word is string =>
				Boolean(word),
			)}
		>
			<ComboboxItemIcon>
				<MemberAvatar member={member} />
			</ComboboxItemIcon>
			<span className="min-w-0 flex-1 py-1">
				<span className="flex min-w-0 gap-1">
					<ComboboxItemText className="truncate" />
					{isCurrentUser && (
						<span className="shrink-0 text-muted-foreground">(you)</span>
					)}
				</span>
				<span className="block truncate text-xs text-muted-foreground">
					{member.email}
				</span>
			</span>
			<ComboboxItemIndicator />
		</ComboboxItem>
	);
}

export function PeopleContent({
	anchor,
	children,
}: {
	anchor: HTMLElement | null;
	children: ReactNode;
}) {
	return (
		<ComboboxContent
			anchor={anchor}
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
			<ComboboxList className="pt-1">{children}</ComboboxList>
		</ComboboxContent>
	);
}
