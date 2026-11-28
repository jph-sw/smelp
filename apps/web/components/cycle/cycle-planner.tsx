import { MinusSignIcon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { tables } from "@smelp/db";
import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { planCycle } from "#/lib/cycle-plan";
import { invalidateCycles } from "#/lib/data/cycle";
import { issuesQueryOptions, updateIssue } from "#/lib/data/issue";
import { moduleQueryKeys } from "#/lib/data/module";
import { statesQueryOptions } from "#/lib/data/state";
import { toastError } from "#/lib/errors";
import { formatPoints, formatShortPoints } from "#/lib/points";
import { IssuePriorityIcon } from "../issue/issue-priority-icon";
import { IssueTypeIcon } from "../issue/issue-type-icon";
import { Button } from "../ui/button";

type Move = { id: string; cycleId: string | null };
type Side = "backlog" | "planned";

function PlanPane({
	title,
	summary,
	issues,
	side,
	emptyText,
	workspaceId,
	buttonRefs,
	onMove,
}: {
	title: string;
	summary?: string;
	issues: tables["issue"][];
	side: Side;
	emptyText: string;
	workspaceId: string;
	buttonRefs: Map<string, HTMLButtonElement>;
	onMove: (issue: tables["issue"], side: Side) => void;
}) {
	const adding = side === "backlog";
	return (
		<section className="flex max-h-full min-h-0 flex-col rounded-lg border">
			<header className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b px-3 py-2">
				<h2 className="text-sm font-medium">{title}</h2>
				<span className="text-xs text-muted-foreground">{issues.length}</span>
				{summary !== undefined && (
					<p
						aria-live="polite"
						className="ms-auto text-xs text-muted-foreground"
					>
						{summary}
					</p>
				)}
			</header>
			{issues.length === 0 ? (
				<p className="p-3 text-sm text-muted-foreground">{emptyText}</p>
			) : (
				<ul aria-label={title} className="min-h-0 overflow-y-auto p-1">
					{issues.map((issue) => (
						<li
							key={issue.id}
							className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1 hover:bg-muted"
						>
							<IssueTypeIcon type={issue.type} />
							<span className="w-16 shrink-0 truncate text-xs font-semibold text-foreground/70">
								{issue.id}
							</span>
							<Link
								to="/$id/browse/$issueId"
								params={{ id: workspaceId, issueId: issue.id }}
								className="min-w-0 flex-1 truncate text-sm hover:underline"
							>
								{issue.title}
							</Link>
							{issue.priority === "none" ? (
								<span className="size-4 shrink-0" />
							) : (
								<IssuePriorityIcon priority={issue.priority} />
							)}
							<span className="w-10 shrink-0 text-end text-xs text-muted-foreground">
								{issue.estimate == null
									? "–"
									: formatShortPoints(issue.estimate)}
							</span>
							<Button
								ref={(button) => {
									if (button) buttonRefs.set(issue.id, button);
									else buttonRefs.delete(issue.id);
								}}
								variant="ghost"
								size="icon-sm"
								aria-label={
									adding
										? `Add ${issue.id} to cycle`
										: `Remove ${issue.id} from cycle`
								}
								title={adding ? "Add to cycle" : "Remove from cycle"}
								onClick={() => onMove(issue, side)}
							>
								<HugeiconsIcon
									icon={adding ? PlusSignIcon : MinusSignIcon}
									aria-hidden
								/>
							</Button>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

export function CyclePlanner({
	workspaceId,
	projectId,
	cycleId,
}: {
	workspaceId: string;
	projectId: string;
	cycleId: string;
}) {
	const queryClient = useQueryClient();
	const issuesQuery = issuesQueryOptions({ projectId });
	const { data: issues } = useSuspenseQuery(issuesQuery);
	const { data: states } = useSuspenseQuery(statesQueryOptions({ projectId }));
	const plan = planCycle(issues, states, cycleId);

	const buttonRefs = useRef(new Map<string, HTMLButtonElement>()).current;
	const [focusNext, setFocusNext] = useState<{ id: string }>();
	useEffect(() => {
		if (focusNext) buttonRefs.get(focusNext.id)?.focus();
	}, [focusNext, buttonRefs]);

	const setCycleId = ({ id, cycleId }: Move) =>
		queryClient.setQueryData(issuesQuery.queryKey, (current) =>
			current?.map((issue) =>
				issue.id === id ? { ...issue, cycleId } : issue,
			),
		);

	const mutationKey = ["plan-cycle", cycleId];
	const { mutate: move } = useMutation({
		mutationKey,
		mutationFn: updateIssue,
		onMutate: async (change: Move) => {
			await queryClient.cancelQueries({ queryKey: issuesQuery.queryKey });
			const previous = issues.find((issue) => issue.id === change.id);
			setCycleId(change);
			return { id: change.id, cycleId: previous?.cycleId ?? null };
		},
		onError: (error, _change, rollback) => {
			if (rollback) setCycleId(rollback);
			toastError(error, "Couldn't move the work item.");
		},
		onSettled: () =>
			Promise.all([
				...moduleQueryKeys(projectId).map((queryKey) =>
					queryClient.invalidateQueries({ queryKey }),
				),
				invalidateCycles(queryClient, projectId),
				// A refetch while a later move is in flight would undo that move on
				// screen, so only the last one to settle refreshes the list.
				queryClient.isMutating({ mutationKey }) === 1 &&
					queryClient.invalidateQueries({ queryKey: issuesQuery.queryKey }),
				queryClient.invalidateQueries({ queryKey: ["issue"] }),
				queryClient.invalidateQueries({ queryKey: ["activity"] }),
			]),
	});

	const onMove = (issue: tables["issue"], side: Side) => {
		// The row leaves its list, so keyboard focus goes to its neighbour's button.
		const list = plan[side];
		const index = list.findIndex((other) => other.id === issue.id);
		const neighbour = list[index + 1] ?? list[index - 1];
		setFocusNext(neighbour && { id: neighbour.id });
		move({ id: issue.id, cycleId: side === "backlog" ? cycleId : null });
	};

	const summary = [
		formatPoints(plan.points),
		plan.unestimated > 0 && `${plan.unestimated} unestimated`,
	]
		.filter(Boolean)
		.join(" · ");

	return (
		<div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto p-4 md:grid-cols-2 md:grid-rows-[minmax(0,1fr)] md:items-start">
			<PlanPane
				title="Backlog"
				issues={plan.backlog}
				side="backlog"
				emptyText="Every open work item is already in a cycle."
				workspaceId={workspaceId}
				buttonRefs={buttonRefs}
				onMove={onMove}
			/>
			<PlanPane
				title="In this cycle"
				summary={summary}
				issues={plan.planned}
				side="planned"
				emptyText="Nothing planned yet. Add work items from the backlog."
				workspaceId={workspaceId}
				buttonRefs={buttonRefs}
				onMove={onMove}
			/>
		</div>
	);
}
