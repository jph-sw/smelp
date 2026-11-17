import type { ProjectMember, tables } from "@smelp/db";
import { Link } from "@tanstack/react-router";
import { initials } from "#/lib/utils";
import { IssuePriorityIcon } from "../issue/issue-priority-icon";
import { IssueTypeIcon } from "../issue/issue-type-icon";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";

// The board's items as rows: grouped by state in the board's column order, the
// most recently updated first within each.
export function IssueList({
	issues,
	states,
	members,
	workspaceId,
}: {
	issues: tables["issue"][];
	states: tables["state"][];
	members: ProjectMember[];
	workspaceId: string;
}) {
	const stateOrder = new Map(states.map((state, index) => [state.id, index]));
	const rows = issues
		.filter((issue) => stateOrder.has(issue.state))
		.sort(
			(a, b) =>
				(stateOrder.get(a.state) ?? 0) - (stateOrder.get(b.state) ?? 0) ||
				b.updatedAt - a.updatedAt,
		);

	if (rows.length === 0) return null;

	return (
		<div className="min-h-0 flex-1 overflow-y-auto p-4">
			<div className="hidden grid-cols-[6.5rem_1fr_9rem_10rem] gap-3 px-2 pb-1 text-xs font-medium text-muted-foreground sm:grid">
				<span>Key</span>
				<span>Title</span>
				<span>State</span>
				<span>Assignee</span>
			</div>
			<ul className="space-y-0.5">
				{rows.map((issue) => {
					const state = states.find((s) => s.id === issue.state);
					const assignee = members.find(
						(member) => member.userId === issue.assignee,
					);
					return (
						<li key={issue.id}>
							<Link
								to="/$id/browse/$issueId"
								params={{ id: workspaceId, issueId: issue.id }}
								className="grid grid-cols-[6rem_1fr_auto_1.5rem] items-center gap-3 rounded-md p-2 text-sm outline-none transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[6.5rem_1fr_9rem_10rem]"
							>
								<span className="flex min-w-0 items-center gap-1.5">
									<IssueTypeIcon type={issue.type} />
									<span className="truncate text-xs font-semibold text-foreground/70">
										{issue.id}
									</span>
								</span>
								<span className="flex min-w-0 items-center gap-1.5">
									{issue.priority !== "none" && (
										<IssuePriorityIcon priority={issue.priority} />
									)}
									<span className="truncate">{issue.title}</span>
								</span>
								<span
									className="flex min-w-0 items-center gap-2"
									title={state?.name}
								>
									<span
										className="size-3 shrink-0 rounded-full ring-1 ring-foreground/20"
										style={{ backgroundColor: state?.color }}
									/>
									<span className="hidden truncate text-xs text-muted-foreground sm:inline">
										{state?.name}
									</span>
								</span>
								<span
									className="flex min-w-0 items-center gap-2"
									title={
										assignee
											? `Assigned to ${assignee.displayName}`
											: "Unassigned"
									}
								>
									{assignee ? (
										<>
											<Avatar size="sm">
												<AvatarImage src={assignee.image ?? undefined} alt="" />
												<AvatarFallback>
													{initials(assignee.displayName)}
												</AvatarFallback>
											</Avatar>
											<span className="hidden truncate text-xs sm:inline">
												{assignee.displayName}
											</span>
										</>
									) : (
										<span className="hidden text-xs text-muted-foreground sm:inline">
											Unassigned
										</span>
									)}
								</span>
							</Link>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
