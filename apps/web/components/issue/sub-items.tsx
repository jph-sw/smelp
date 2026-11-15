import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { tables } from "@smelp/db";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { projectQueryOptions } from "#/lib/data/project";
import { Button } from "../ui/button";
import { openCreateIssueDialog } from "./create-issue-dialog-store";

const DONE_GROUPS = ["completed", "cancelled"];

// Children of a work item, with how many are done. Cancelled counts as done: it's
// closed, so it shouldn't hold the parent's progress back.
export function SubItems({
	issue,
	workspaceId,
	issues,
	states,
	canWrite,
}: {
	issue: tables["issue"];
	workspaceId: string;
	issues: tables["issue"][];
	states: tables["state"][];
	canWrite: boolean;
}) {
	const { data: project } = useSuspenseQuery(
		projectQueryOptions({ projectId: issue.projectId }),
	);
	const children = issues
		.filter((item) => item.parentId === issue.id)
		.sort((a, b) => a.createdAt - b.createdAt);
	if (children.length === 0 && !canWrite) return null;

	const stateOf = (id: string) => states.find((state) => state.id === id);
	const done = children.filter((child) =>
		DONE_GROUPS.includes(stateOf(child.state)?.group ?? ""),
	).length;
	const percent = children.length
		? Math.round((done / children.length) * 100)
		: 0;

	return (
		<section className="space-y-3" aria-label="Sub-items">
			<div className="flex items-center justify-between gap-3">
				<h2 className="text-sm font-semibold">Sub-items</h2>
				{canWrite && (
					<Button
						variant="outline"
						size="sm"
						onClick={() =>
							openCreateIssueDialog({
								workspaceId,
								projectId: issue.projectId,
								projectName: project.name,
								parentId: issue.id,
							})
						}
					>
						<HugeiconsIcon icon={PlusSignIcon} />
						Add sub-item
					</Button>
				)}
			</div>
			{children.length > 0 ? (
				<>
					<div className="flex items-center gap-3 text-xs text-muted-foreground">
						<div
							role="progressbar"
							aria-label="Sub-items done"
							aria-valuemin={0}
							aria-valuemax={100}
							aria-valuenow={percent}
							className="h-1.5 w-40 overflow-hidden rounded-full bg-secondary"
						>
							<div
								className="h-full bg-primary"
								style={{ width: `${percent}%` }}
							/>
						</div>
						<span>
							{done} of {children.length} done
						</span>
					</div>
					<ul className="divide-y rounded-lg border">
						{children.map((child) => {
							const state = stateOf(child.state);
							return (
								<li key={child.id}>
									<Link
										to="/$id/browse/$issueId"
										params={{ id: workspaceId, issueId: child.id }}
										className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-secondary"
									>
										<span className="shrink-0 text-xs text-muted-foreground">
											{child.id}
										</span>
										<span className="min-w-0 flex-1 truncate">
											{child.title}
										</span>
										<span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
											<span
												aria-hidden
												className="size-2 rounded-full"
												style={{ backgroundColor: state?.color }}
											/>
											{state?.name ?? "Unknown"}
										</span>
									</Link>
								</li>
							);
						})}
					</ul>
				</>
			) : (
				<p className="text-sm text-muted-foreground">No sub-items yet.</p>
			)}
		</section>
	);
}
