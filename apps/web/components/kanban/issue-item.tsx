import { useDraggable } from "@dnd-kit/react";
import { People } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { tables } from "@smelp/db";
import { Link } from "@tanstack/react-router";
import { cn } from "#/lib/utils";
import { Button } from "../ui/button";

export function IssueItem({
	issue,
	workspaceId,
}: {
	issue: tables["issue"];
	workspaceId: string;
}) {
	const { ref, isDragging } = useDraggable({
		id: issue.id,
	});

	return (
		<div className="relative w-full">
			<Link
				to="/$id/browse/$issueId"
				params={{ id: workspaceId, issueId: issue.id }}
				id={issue.id}
				ref={ref}
				className="block w-full rounded-lg bg-secondary p-3 pb-10 outline-none transition-colors duration-150 hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] focus-visible:ring-2 focus-visible:ring-ring"
			>
				<div className="mb-1 text-xs font-semibold text-foreground/70">
					{issue.id}
				</div>
				<div className="text-sm [overflow-wrap:anywhere]">{issue.title}</div>
			</Link>
			{/* A sibling of the link, since a button can't be nested inside an anchor. */}
			<Button
				variant={"outline"}
				size={"icon-xs"}
				className={cn("absolute bottom-3 left-3", isDragging && "invisible")}
				aria-label="Assign work item"
			>
				<HugeiconsIcon icon={People} />
			</Button>
		</div>
	);
}
