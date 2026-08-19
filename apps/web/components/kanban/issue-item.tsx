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
			className="w-full block rounded-lg bg-secondary p-3  transition-all  hover:cursor-pointer"
			key={issue.id}
		>
			{issue.title}
		</Link>
	);
}
