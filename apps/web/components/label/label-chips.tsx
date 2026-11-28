import type { Label } from "#/lib/data/label";
import { cn } from "#/lib/utils";

export function LabelDot({
	color,
	className,
}: {
	color: string;
	className?: string;
}) {
	return (
		<span
			aria-hidden
			className={cn(
				"size-2 shrink-0 rounded-full ring-1 ring-foreground/20",
				className,
			)}
			style={{ backgroundColor: color }}
		/>
	);
}

export function LabelChip({
	label,
	className,
}: {
	label: Pick<Label, "name" | "color">;
	className?: string;
}) {
	return (
		<span
			title={label.name}
			className={cn(
				"inline-flex h-5 min-w-0 max-w-36 items-center gap-1 rounded-full border px-1.5 text-xs text-muted-foreground",
				className,
			)}
		>
			<LabelDot color={label.color} />
			<span className="truncate">{label.name}</span>
		</span>
	);
}

// In the project's order, so ids of deleted labels drop out.
export const labelsOf = (labels: Label[], labelIds: string[]) =>
	labels.filter((label) => labelIds.includes(label.id));

export function LabelChips({
	labels,
	max = 3,
	className,
}: {
	labels: Label[];
	max?: number;
	className?: string;
}) {
	if (labels.length === 0) return null;
	const shown = labels.slice(0, max);
	const hidden = labels.slice(max);
	return (
		<span className={cn("flex min-w-0 flex-wrap gap-1", className)}>
			<span className="sr-only">Labels: </span>
			{shown.map((label) => (
				<LabelChip key={label.id} label={label} />
			))}
			{hidden.length > 0 && (
				<span
					title={hidden.map((label) => label.name).join(", ")}
					className="inline-flex h-5 shrink-0 items-center rounded-full border px-1.5 text-xs text-muted-foreground"
				>
					+{hidden.length}
					<span className="sr-only">
						{" "}
						more: {hidden.map((label) => label.name).join(", ")}
					</span>
				</span>
			)}
		</span>
	);
}
