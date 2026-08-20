import { useDraggable } from "@dnd-kit/react";
import { People } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { tables } from "@smelp/db";
import { Link } from "@tanstack/react-router";
import { Button } from "../ui/button";

export function IssueItem({
	issue,
	workspaceId,
}: {
	issue: tables["issue"];
	workspaceId: string;
}) {
	const { ref } = useDraggable({
		id: issue.id,
	});

	return (
		<Link
			to="/$id/browse/$issueId"
			params={{ id: workspaceId, issueId: issue.id }}
			id={issue.id}
			ref={ref}
			className="w-full block rounded-lg bg-secondary p-3  transition-all  hover:cursor-pointer"
			key={issue.id}
		>
			<div className="w-full flex items-center mb-1">
				<span className="text-xs font-semibold text-foreground/70">
					{issue.id}
				</span>
			</div>
			{issue.title}
			<div className="w-full flex items-center gap-1 pt-2">
				<Button
					variant={"outline"}
					size={"icon-xs"}
					onClick={(e) => e.stopPropagation()}
				>
					<HugeiconsIcon icon={People} />
				</Button>
			</div>
		</Link>
	);
}
