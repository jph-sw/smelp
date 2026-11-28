import { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";

export type CycleValues = {
	name: string;
	startDate: string;
	endDate: string;
	goal: string;
};

// Name, dates and goal of a cycle. The server has the final say on overlaps, so a
// refusal comes back through onSubmit as an error toast.
export function CycleForm({
	initial,
	submitLabel,
	isPending,
	onSubmit,
}: {
	initial?: CycleValues;
	submitLabel: string;
	isPending: boolean;
	onSubmit: (values: CycleValues) => void;
}) {
	const [name, setName] = useState(initial?.name ?? "");
	const [startDate, setStartDate] = useState(initial?.startDate ?? "");
	const [endDate, setEndDate] = useState(initial?.endDate ?? "");
	const [goal, setGoal] = useState(initial?.goal ?? "");

	const endsBeforeStart = Boolean(startDate && endDate && endDate < startDate);
	const isComplete = Boolean(name.trim() && startDate && endDate);

	return (
		<form
			className="flex flex-col gap-3"
			onSubmit={(event) => {
				event.preventDefault();
				if (isComplete && !endsBeforeStart) {
					onSubmit({
						name: name.trim(),
						startDate,
						endDate,
						goal: goal.trim(),
					});
				}
			}}
		>
			<label className="flex flex-col gap-1 text-xs text-muted-foreground">
				Name
				<Input
					value={name}
					maxLength={64}
					placeholder="Sprint 12"
					onChange={(event) => setName(event.target.value)}
				/>
			</label>
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<label className="flex flex-col gap-1 text-xs text-muted-foreground">
					Start
					<Input
						type="date"
						value={startDate}
						onChange={(event) => setStartDate(event.target.value)}
					/>
				</label>
				<label className="flex flex-col gap-1 text-xs text-muted-foreground">
					End
					<Input
						type="date"
						value={endDate}
						min={startDate || undefined}
						aria-invalid={endsBeforeStart}
						onChange={(event) => setEndDate(event.target.value)}
					/>
				</label>
			</div>
			<label className="flex flex-col gap-1 text-xs text-muted-foreground">
				Goal (optional)
				<Textarea
					value={goal}
					maxLength={500}
					placeholder="Why this cycle is worth doing"
					onChange={(event) => setGoal(event.target.value)}
				/>
			</label>
			{endsBeforeStart && (
				<p className="text-xs text-destructive">
					The cycle can't end before it starts.
				</p>
			)}
			<Button
				type="submit"
				className="self-start"
				disabled={!isComplete || endsBeforeStart || isPending}
			>
				{submitLabel}
			</Button>
		</form>
	);
}
