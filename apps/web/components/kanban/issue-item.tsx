import { useDraggable } from "@dnd-kit/react";
import type { tables } from "@smelp/db";

export function IssueItem({ issue }: { issue: tables["issue"] }) {
	const { ref } = useDraggable({
		id: issue.id,
	});

	return (
		<div
			id={issue.id}
			ref={ref}
			className="w-full block rounded-lg border bg-secondary p-3 outline-[0.5px] transition-all hover:border hover:cursor-pointer"
			key={issue.id}
		>
			{issue.title}
		</div>
	);
}
