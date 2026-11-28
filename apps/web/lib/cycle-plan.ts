import type { tables } from "@smelp/db";

type PlannableIssue = Pick<tables["issue"], "cycleId" | "state" | "estimate">;

export type CyclePlan<T> = {
	backlog: T[];
	planned: T[];
	points: number;
	unestimated: number;
};

// Cancelled items stay in the cycle but don't count, like the server's progress.
export function planCycle<T extends PlannableIssue>(
	issues: T[],
	states: Pick<tables["state"], "id" | "group">[],
	cycleId: string,
): CyclePlan<T> {
	const groupOf = new Map(states.map((state) => [state.id, state.group]));
	const plan: CyclePlan<T> = {
		backlog: [],
		planned: [],
		points: 0,
		unestimated: 0,
	};
	for (const issue of issues) {
		const group = groupOf.get(issue.state);
		if (issue.cycleId === cycleId) {
			plan.planned.push(issue);
			if (group === "cancelled") continue;
			if (issue.estimate == null) plan.unestimated += 1;
			else plan.points += issue.estimate;
		} else if (
			issue.cycleId == null &&
			group !== "completed" &&
			group !== "cancelled"
		) {
			plan.backlog.push(issue);
		}
	}
	return plan;
}
