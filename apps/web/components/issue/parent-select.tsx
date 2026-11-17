import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Combobox,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
	ComboboxItemIndicator,
	ComboboxItemText,
	ComboboxList,
	ComboboxTrigger,
} from "@ui-sdk/react/combobox";
import { useState } from "react";
import type { IssueType } from "#/lib/issue-types";
import { cn } from "#/lib/utils";
import { IssueTypeIcon } from "./issue-type-icon";

const NO_PARENT = "none";

export type ParentOption = { id: string; title: string; type: IssueType };

export function ParentSelect({
	value,
	options,
	disabled,
	className,
	onChange,
}: {
	value: string | null;
	options: ParentOption[];
	disabled?: boolean;
	className?: string;
	onChange: (value: string | null) => void;
}) {
	const [button, setButton] = useState<HTMLButtonElement | null>(null);
	const [query, setQuery] = useState("");

	const optionById = new Map(options.map((option) => [option.id, option]));
	const labelOf = (id: string) =>
		id === NO_PARENT ? "No parent" : (optionById.get(id)?.title ?? id);
	const selected = value === null ? undefined : optionById.get(value);

	return (
		<Combobox
			presentation="auto"
			disabled={disabled}
			value={value ?? NO_PARENT}
			onValueChange={(next) =>
				next != null && onChange(next === NO_PARENT ? null : next)
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
				<span className="min-w-0 flex-1 truncate text-start">
					<span className="sr-only">Parent: </span>
					{value === null ? (
						"No parent"
					) : (
						<>
							<span className="text-muted-foreground">{value}</span>
							{selected && ` ${selected.title}`}
						</>
					)}
				</span>
			</ComboboxTrigger>
			<ComboboxContent
				anchor={button}
				sideOffset={4}
				className="w-80 data-[presentation=sheet]:h-[70dvh] data-[presentation=sheet]:w-full [&_[data-slot=combobox-header]]:border-b [&_[data-slot=combobox-header]]:px-2"
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
						aria-label="Search for a parent"
						placeholder="Search work items…"
						className="h-8 w-full min-w-0 border-0 bg-transparent px-0 shadow-none focus:outline-none"
					/>
				</div>
				<ComboboxEmpty>No work items found.</ComboboxEmpty>
				<ComboboxList className="pt-1">
					<ComboboxItem value={NO_PARENT} label="No parent">
						<ComboboxItemText className="min-w-0 flex-1 truncate" />
						<ComboboxItemIndicator />
					</ComboboxItem>
					{options.map((option) => (
						<ComboboxItem
							key={option.id}
							value={option.id}
							label={option.title}
							keywords={[option.id]}
						>
							<IssueTypeIcon type={option.type} />
							<span className="shrink-0 text-muted-foreground">
								{option.id}
							</span>
							<ComboboxItemText className="min-w-0 flex-1 truncate" />
							<ComboboxItemIndicator />
						</ComboboxItem>
					))}
				</ComboboxList>
			</ComboboxContent>
		</Combobox>
	);
}
