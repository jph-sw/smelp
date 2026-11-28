import {
	Combobox,
	ComboboxTrigger,
	ComboboxValue,
} from "@ui-sdk/react/combobox";
import { useState } from "react";
import type { Label } from "#/lib/data/label";
import { cn } from "#/lib/utils";
import { LabelsContent } from "../issue/label-select";
import { LabelDot } from "../label/label-chips";

export function LabelFilter({
	value,
	labels,
	onChange,
	className,
}: {
	value: string[] | undefined;
	labels: Label[];
	onChange: (value: string[] | undefined) => void;
	className?: string;
}) {
	const [button, setButton] = useState<HTMLButtonElement | null>(null);
	const [query, setQuery] = useState("");

	const labelById = new Map(labels.map((label) => [label.id, label]));
	const selected = value ?? [];

	return (
		<Combobox
			multiple
			presentation="auto"
			value={selected}
			onValueChange={(next) =>
				onChange(next.length > 0 ? (next as string[]) : undefined)
			}
			itemToLabel={(id) => labelById.get(id)?.name ?? "Deleted label"}
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
					<span aria-hidden className="flex shrink-0 -space-x-0.5">
						{selected.slice(0, 3).map((id) => (
							<LabelDot
								key={id}
								color={labelById.get(id)?.color ?? "transparent"}
								className="size-2.5 ring-background ring-2"
							/>
						))}
					</span>
				)}
				<span className="min-w-0 flex-1 truncate text-start">
					<span className="sr-only">Label: </span>
					<ComboboxValue maxLabels={1}>
						{(state) => state.label || "Any label"}
					</ComboboxValue>
				</span>
			</ComboboxTrigger>
			<LabelsContent anchor={button} labels={labels} />
		</Combobox>
	);
}
