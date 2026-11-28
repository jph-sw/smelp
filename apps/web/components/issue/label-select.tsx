import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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
} from "@ui-sdk/react/combobox";
import { useState } from "react";
import type { Label } from "#/lib/data/label";
import { cn } from "#/lib/utils";
import { LabelChips, LabelDot, labelsOf } from "../label/label-chips";

export function LabelOption({ label }: { label: Label }) {
	return (
		<ComboboxItem value={label.id} label={label.name}>
			<ComboboxItemIcon>
				<LabelDot color={label.color} className="size-2.5" />
			</ComboboxItemIcon>
			<ComboboxItemText className="min-w-0 flex-1 truncate" />
			<ComboboxItemIndicator />
		</ComboboxItem>
	);
}

export function LabelsContent({
	anchor,
	labels,
}: {
	anchor: HTMLElement | null;
	labels: Label[];
}) {
	return (
		<ComboboxContent
			anchor={anchor}
			sideOffset={4}
			className="w-64 data-[presentation=sheet]:h-[70dvh] data-[presentation=sheet]:w-full [&_[data-slot=combobox-header]]:border-b [&_[data-slot=combobox-header]]:px-2"
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
					aria-label="Search labels"
					placeholder="Search labels…"
					className="h-8 w-full min-w-0 border-0 bg-transparent px-0 shadow-none focus:outline-none"
				/>
			</div>
			<ComboboxEmpty>No labels found.</ComboboxEmpty>
			<ComboboxList className="pt-1">
				{labels.map((label) => (
					<LabelOption key={label.id} label={label} />
				))}
			</ComboboxList>
		</ComboboxContent>
	);
}

export function LabelSelect({
	value,
	labels,
	disabled,
	className,
	onChange,
}: {
	value: string[];
	labels: Label[];
	disabled?: boolean;
	className?: string;
	onChange: (labelIds: string[]) => void;
}) {
	const [button, setButton] = useState<HTMLButtonElement | null>(null);
	const [query, setQuery] = useState("");
	const selected = labelsOf(labels, value);
	const nameOf = (id: string) =>
		labels.find((label) => label.id === id)?.name ?? "Deleted label";

	return (
		<Combobox
			multiple
			presentation="auto"
			disabled={disabled}
			value={selected.map((label) => label.id)}
			onValueChange={(next) => onChange(next as string[])}
			itemToLabel={nameOf}
			query={query}
			onQueryChange={setQuery}
			onOpenChange={(open) => open && setQuery("")}
			onOpenChangeComplete={(open) => !open && button?.focus()}
		>
			<ComboboxTrigger
				ref={setButton}
				className={cn("h-auto min-h-8 justify-start py-1", className)}
			>
				{selected.length > 0 ? (
					<LabelChips
						labels={selected}
						max={Number.POSITIVE_INFINITY}
						className="py-0.5"
					/>
				) : (
					<span className="text-muted-foreground">
						<span className="sr-only">Labels: </span>No labels
					</span>
				)}
			</ComboboxTrigger>
			<LabelsContent anchor={button} labels={labels} />
		</Combobox>
	);
}
