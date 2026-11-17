import { HugeiconsIcon } from "@hugeicons/react";
import {
	ISSUE_PRIORITIES,
	ISSUE_PRIORITY_INFO,
	type IssuePriority,
} from "#/lib/issue-priorities";
import { cn } from "#/lib/utils";

export function IssuePriorityIcon({
	priority,
	className,
}: {
	priority: IssuePriority;
	className?: string;
}) {
	const info = ISSUE_PRIORITY_INFO[priority];
	const name = `${info.label} priority`;
	return (
		<span
			role="img"
			aria-label={name}
			title={name}
			className={cn("inline-flex shrink-0", info.className, className)}
		>
			<HugeiconsIcon icon={info.icon} aria-hidden className="size-4" />
		</span>
	);
}

export const ISSUE_PRIORITY_ITEMS = ISSUE_PRIORITIES.map((priority) => ({
	label: ISSUE_PRIORITY_INFO[priority].label,
	value: priority,
	icon: (
		<HugeiconsIcon
			icon={ISSUE_PRIORITY_INFO[priority].icon}
			className={cn("size-4 shrink-0", ISSUE_PRIORITY_INFO[priority].className)}
		/>
	),
}));
