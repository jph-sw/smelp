import type { orpc } from "#/lib/orpc";
import { formatPoints, roundPoints } from "#/lib/points";
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
						{progress.points.total > 0 && (
							<span>
								{formatPoints(progress.points.total)},{" "}
								{roundPoints(progress.points.completed)} done
							</span>
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

type Velocity = NonNullable<Cycle["velocity"]>;
type MeasuredCycle = Cycle & { velocity: Velocity };

// A cycle nothing was planned into says nothing about the team's pace.
export function measuredCycles(cycles: Cycle[]): MeasuredCycle[] {
	return cycles.filter(
		(cycle): cycle is MeasuredCycle =>
			cycle.status === "completed" &&
			cycle.velocity !== null &&
			cycle.velocity.committed.points > 0,
	);
}

// Takes the cycles oldest first, as the API lists them.
export function averageVelocity(cycles: MeasuredCycle[]) {
	const recent = cycles.slice(-3);
	if (recent.length === 0) return null;
	const total = recent.reduce(
		(sum, cycle) => sum + cycle.velocity.completed.points,
		0,
	);
	return {
		points: Math.round((total / recent.length) * 10) / 10,
		count: recent.length,
	};
}

const lastCycles = (count: number) =>
	count === 1 ? "the last cycle" : `the last ${count} cycles`;

export function VelocityChart({ cycles }: { cycles: MeasuredCycle[] }) {
	const shown = cycles.slice(-6);
	const average = averageVelocity(cycles);
	const max = Math.max(
		...shown.map((cycle) =>
			Math.max(
				cycle.velocity.committed.points,
				cycle.velocity.completed.points,
			),
		),
	);
	const height = (points: number) => `${(points / max) * 100}%`;

	return (
		<div className="flex flex-col gap-3 rounded-lg border p-3">
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
				{average && (
					<span>
						Average of {lastCycles(average.count)}:{" "}
						<span className="font-medium text-foreground">
							{formatPoints(average.points)}
						</span>
					</span>
				)}
				<span className="ms-auto flex items-center gap-3">
					<span className="flex items-center gap-1.5">
						<span className="size-2 rounded-sm bg-muted-foreground/30" />
						Committed
					</span>
					<span className="flex items-center gap-1.5">
						<span className="size-2 rounded-sm bg-primary" />
						Completed
					</span>
				</span>
			</div>
			<ul className="sr-only">
				{shown.map((cycle) => (
					<li key={cycle.id}>
						{cycle.name}: {roundPoints(cycle.velocity.completed.points)} of{" "}
						{formatPoints(cycle.velocity.committed.points)} completed
					</li>
				))}
			</ul>
			<div aria-hidden className="flex gap-2">
				{shown.map((cycle) => (
					<div key={cycle.id} className="flex min-w-0 flex-1 flex-col gap-1">
						<div className="flex h-24 items-end justify-center gap-0.5">
							<div
								className="w-3 rounded-t-sm bg-muted-foreground/30"
								style={{ height: height(cycle.velocity.committed.points) }}
							/>
							<div
								className="w-3 rounded-t-sm bg-primary"
								style={{ height: height(cycle.velocity.completed.points) }}
							/>
						</div>
						<span className="truncate text-center text-xs text-muted-foreground">
							{cycle.name}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}
