import { cn } from "#/lib/utils";

export type ModuleProgress = {
	total: number;
	done: number;
	inProgress: number;
	notStarted: number;
	cancelled: number;
};

// Cancelled items are neither left to do nor done, so they stay out of the percentage.
export function percentDone(progress: ModuleProgress) {
	const counted = progress.total - progress.cancelled;
	return counted > 0 ? Math.round((progress.done / counted) * 100) : 0;
}

export function formatTargetDate(day: string) {
	return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, {
		dateStyle: "medium",
		timeZone: "UTC",
	});
}

export function ModuleProgressBar({
	progress,
	className,
}: {
	progress: ModuleProgress;
	className?: string;
}) {
	const percent = percentDone(progress);
	return (
		<div className={cn("flex flex-col gap-1.5", className)}>
			<div
				role="progressbar"
				aria-label="Module progress"
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={percent}
				className="h-2 w-full overflow-hidden rounded-full bg-secondary"
			>
				<div
					className="h-full rounded-full bg-primary transition-[width] duration-200"
					style={{ width: `${percent}%` }}
				/>
			</div>
			<p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
				<span className="font-medium text-foreground">{percent}%</span>
				<span>{progress.done} done</span>
				<span>{progress.inProgress} in progress</span>
				<span>{progress.notStarted} not started</span>
				{progress.cancelled > 0 && <span>{progress.cancelled} cancelled</span>}
			</p>
		</div>
	);
}
