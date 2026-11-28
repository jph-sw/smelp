import { useSuspenseQuery } from "@tanstack/react-query";
import { cycleBurnupQueryOptions } from "#/lib/data/cycle";
import { formatShortDay } from "#/lib/day";
import { roundPoints } from "#/lib/points";

const HEIGHT = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

const daysBetween = (from: string, to: string) =>
	Math.round(
		(Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS,
	);

function niceTicks(max: number, whole: boolean) {
	if (max <= 0) return [0, 1];
	const rough = whole ? Math.max(max / 4, 1) : max / 4;
	const power = 10 ** Math.floor(Math.log10(rough));
	const step =
		[1, 2, 5, 10].map((factor) => factor * power).find((s) => s >= rough) ??
		10 * power;
	const top = Math.ceil(max / step) * step;
	return Array.from({ length: Math.round(top / step) + 1 }, (_, i) =>
		roundPoints(i * step),
	);
}

// A day's number is its state at the day's end, drawn across that whole day.
function stepPath(values: number[], y: (value: number) => number) {
	return values
		.map((value, i) => `${i === 0 ? "M0" : "V"} ${y(value)} H${i + 1}`)
		.join(" ");
}

function LineKey({
	dashed,
	className,
}: {
	dashed?: boolean;
	className: string;
}) {
	return (
		<svg width="16" height="8" aria-hidden="true" className={className}>
			<line
				x1="0"
				x2="16"
				y1="4"
				y2="4"
				stroke="currentColor"
				strokeWidth="2"
				strokeDasharray={dashed ? "3 3" : undefined}
			/>
		</svg>
	);
}

export function CycleBurnup({
	cycle,
}: {
	cycle: { id: string; startDate: string; endDate: string };
}) {
	const { data } = useSuspenseQuery(
		cycleBurnupQueryOptions({ cycleId: cycle.id }),
	);
	const last = data.days.at(-1);
	if (!last) return null;

	const span = daysBetween(cycle.startDate, cycle.endDate) + 1;
	const ticks = niceTicks(
		Math.max(...data.days.map((day) => day.scope)),
		data.unit === "items",
	);
	const top = ticks.at(-1) as number;
	const y = (value: number) => HEIGHT - (value / top) * HEIGHT;
	const unit = data.unit === "points" ? "points" : "items";
	const scope = stepPath(
		data.days.map((day) => day.scope),
		y,
	);
	const completed = stepPath(
		data.days.map((day) => day.completed),
		y,
	);

	return (
		<figure className="flex flex-col gap-2">
			<figcaption className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
				<span className="font-medium text-foreground">Burn-up</span>
				<span>in {unit}</span>
				<span className="ms-auto flex flex-wrap items-center gap-x-3">
					<span className="flex items-center gap-1.5">
						<LineKey className="text-primary" />
						Completed
					</span>
					<span className="flex items-center gap-1.5">
						<LineKey className="text-muted-foreground" />
						Scope
					</span>
					<span className="flex items-center gap-1.5">
						<LineKey dashed className="text-muted-foreground" />
						Ideal
					</span>
				</span>
			</figcaption>
			<div className="flex gap-2">
				<div className="relative w-6 shrink-0 text-end text-[11px] tabular-nums text-muted-foreground">
					{ticks.map((tick) => (
						<span
							key={tick}
							className="absolute inset-x-0 -translate-y-1/2"
							style={{ top: `${(y(tick) / HEIGHT) * 100}%` }}
						>
							{tick}
						</span>
					))}
				</div>
				<svg
					role="img"
					aria-label={`Burn-up: ${roundPoints(last.completed)} of ${roundPoints(last.scope)} ${unit} done on ${formatShortDay(last.day)}`}
					viewBox={`0 0 ${span} ${HEIGHT}`}
					preserveAspectRatio="none"
					className="h-40 min-w-0 flex-1 overflow-visible"
				>
					<g fill="none" strokeLinejoin="round" strokeLinecap="round">
						{ticks.map((tick) => (
							<line
								key={tick}
								x1="0"
								x2={span}
								y1={y(tick)}
								y2={y(tick)}
								stroke="var(--border)"
								strokeWidth="1"
								vectorEffect="non-scaling-stroke"
							/>
						))}
						<path
							d={`${completed} V${HEIGHT} H0 Z`}
							fill="var(--primary)"
							fillOpacity="0.1"
							stroke="none"
						/>
						<line
							x1="0"
							y1={HEIGHT}
							x2={span}
							y2={y(last.scope)}
							stroke="var(--muted-foreground)"
							strokeWidth="1.5"
							strokeDasharray="4 4"
							vectorEffect="non-scaling-stroke"
						/>
						<path
							d={scope}
							stroke="var(--muted-foreground)"
							strokeWidth="2"
							vectorEffect="non-scaling-stroke"
						/>
						<path
							d={completed}
							stroke="var(--primary)"
							strokeWidth="2"
							vectorEffect="non-scaling-stroke"
						/>
					</g>
					{data.days.map((day, i) => (
						<rect
							key={day.day}
							x={i}
							width="1"
							y="0"
							height={HEIGHT}
							fill="transparent"
						>
							<title>
								{`${formatShortDay(day.day)}: ${roundPoints(day.completed)} of ${roundPoints(day.scope)} ${unit} done`}
							</title>
						</rect>
					))}
				</svg>
			</div>
			<div className="ms-8 flex justify-between text-[11px] text-muted-foreground">
				<span>{formatShortDay(cycle.startDate)}</span>
				<span>{formatShortDay(cycle.endDate)}</span>
			</div>
		</figure>
	);
}
