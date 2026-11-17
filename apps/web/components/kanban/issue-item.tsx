import { useDraggable } from "@dnd-kit/react";
import { MoreHorizontal } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ProjectMember, tables } from "@smelp/db";
import { Link } from "@tanstack/react-router";
import { cn, initials } from "#/lib/utils";
import { IssuePriorityIcon } from "../issue/issue-priority-icon";
import { IssueTypeIcon } from "../issue/issue-type-icon";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Button } from "../ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "../ui/dropdown-menu";

export function IssueItem({
	issue,
	workspaceId,
	assignee,
	draggable = true,
	states,
	onMove,
}: {
	issue: tables["issue"];
	workspaceId: string;
	assignee?: ProjectMember;
	draggable?: boolean;
	/** With onMove, touch screens get a menu to change the state without dragging. */
	states?: tables["state"][];
	onMove?: (stateId: string) => void;
}) {
	const { ref, isDragging } = useDraggable({
		id: issue.id,
		disabled: !draggable,
	});
	const canMove = Boolean(draggable && states && onMove);

	return (
		<div className="relative">
			<Link
				to="/$id/browse/$issueId"
				params={{ id: workspaceId, issueId: issue.id }}
				id={issue.id}
				ref={ref}
				className="block w-full rounded-md border bg-background p-2.5 shadow-xs outline-none transition-colors duration-150 hover:border-input focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:select-none pointer-coarse:[-webkit-touch-callout:none]"
			>
				<div className="mb-1 flex items-center justify-between gap-2">
					<span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
						<IssueTypeIcon type={issue.type} />
						{issue.id}
					</span>
					<span
						className={cn(
							"flex items-center gap-1.5",
							canMove && "pointer-coarse:me-9",
						)}
					>
						{issue.priority !== "none" && (
							<IssuePriorityIcon priority={issue.priority} />
						)}
						{assignee && (
							<Avatar size="sm" title={`Assigned to ${assignee.displayName}`}>
								<AvatarImage src={assignee.image ?? undefined} alt="" />
								<AvatarFallback>
									{initials(assignee.displayName)}
								</AvatarFallback>
							</Avatar>
						)}
					</span>
				</div>
				<div className="text-sm [overflow-wrap:anywhere]">{issue.title}</div>
			</Link>
			{canMove && states && onMove && (
				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label={`Move ${issue.id} to another state`}
								className={cn(
									"absolute top-0 right-0 hidden pointer-coarse:inline-flex",
									isDragging && "invisible",
								)}
							/>
						}
					>
						<HugeiconsIcon icon={MoreHorizontal} className="size-4" />
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="min-w-48">
						<DropdownMenuGroup>
							<DropdownMenuLabel>Move to</DropdownMenuLabel>
							<DropdownMenuRadioGroup
								value={issue.state}
								onValueChange={(stateId) => {
									if (stateId !== issue.state) onMove(String(stateId));
								}}
							>
								{states.map((state) => (
									<DropdownMenuRadioItem key={state.id} value={state.id}>
										<span
											className="size-2.5 shrink-0 rounded-full ring-1 ring-foreground/20"
											style={{ backgroundColor: state.color }}
										/>
										{state.name}
									</DropdownMenuRadioItem>
								))}
							</DropdownMenuRadioGroup>
						</DropdownMenuGroup>
					</DropdownMenuContent>
				</DropdownMenu>
			)}
		</div>
	);
}
