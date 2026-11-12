import type { orpc } from "#/lib/orpc";
import { cn } from "#/lib/utils";

export type Cycle = Awaited<ReturnType<typeof orpc.cycles.find>>[number];

const STATUS_STYLES = {
	current: "bg-primary/15 text-primary",
	upcoming: "bg-secondary text-secondary-foreground",
	completed: "bg-muted text-muted-foreground",
} as const;

const STATUS_LABELS = {
	upcoming: "Upcoming",
	current: "Current",
	completed: "Completed",
} as const;

export function CycleStatusBadge({ status }: { status: Cycle["status"] }) {
	return (
		<span
			className={cn(
				"shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
				STATUS_STYLES[status],
			)}
		>
			{STATUS_LABELS[status]}
		</span>
	);
}

// Cancelled items don't count towards the goal, so they're left out of the bar.
export function CycleProgress({
	progress,
	showLegend,
}: {
	progress: Cycle["progress"];
	showLegend?: boolean;
}) {
	const counted = progress.total - progress.cancelled;
	const notStarted = progress.backlog + progress.unstarted;
	const percent = (count: number) =>
		counted > 0 ? (count / counted) * 100 : 0;
	const donePercent = Math.round(percent(progress.completed));

	return (
		<div className="flex flex-col gap-1.5">
			<div
				role="progressbar"
				aria-label="Cycle progress"
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={donePercent}
				aria-valuetext={`${donePercent}% done`}
				className="flex h-2 w-full overflow-hidden rounded-full bg-muted"
			>
				<div
					className="bg-primary"
					style={{ width: `${percent(progress.completed)}%` }}
				/>
				<div
					className="bg-primary/40"
					style={{ width: `${percent(progress.started)}%` }}
				/>
			</div>
			<div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
				<span className="font-medium text-foreground">{donePercent}%</span>
				{showLegend ? (
					<>
						<span>{progress.completed} done</span>
						<span>{progress.started} in progress</span>
						<span>{notStarted} not started</span>
						{progress.cancelled > 0 && (
							<span>{progress.cancelled} cancelled</span>
						)}
					</>
				) : (
					<span>
						{progress.completed} of {counted} done
					</span>
				)}
			</div>
		</div>
	);
}
