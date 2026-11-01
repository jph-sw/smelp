import { useDraggable } from "@dnd-kit/react";
import type { ProjectMember, tables } from "@smelp/db";
import { Link } from "@tanstack/react-router";
import { initials } from "#/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";

export function IssueItem({
	issue,
	workspaceId,
	assignee,
}: {
	issue: tables["issue"];
	workspaceId: string;
	assignee?: ProjectMember;
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
			<div className="mb-1 flex items-center justify-between gap-2">
				<span className="text-xs font-semibold text-foreground/70">
					{issue.id}
				</span>
				{assignee && (
					<Avatar size="sm" title={`Assigned to ${assignee.displayName}`}>
						<AvatarImage src={assignee.image ?? undefined} alt="" />
						<AvatarFallback>{initials(assignee.displayName)}</AvatarFallback>
					</Avatar>
				)}
			</div>
			<div className="text-sm [overflow-wrap:anywhere]">{issue.title}</div>
		</Link>
	);
}
