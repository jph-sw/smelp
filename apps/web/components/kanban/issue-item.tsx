import { useDraggable } from "@dnd-kit/react";
import type { tables } from "@smelp/db";
import { Link } from "@tanstack/react-router";

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
			className="block w-full rounded-lg bg-secondary p-3 outline-none transition-colors duration-150 hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] focus-visible:ring-2 focus-visible:ring-ring"
		>
			<div className="mb-1 text-xs font-semibold text-foreground/70">
				{issue.id}
			</div>
			<div className="text-sm [overflow-wrap:anywhere]">{issue.title}</div>
		</Link>
	);
}
