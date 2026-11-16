import { HugeiconsIcon } from "@hugeicons/react";
import {
	ISSUE_TYPE_INFO,
	ISSUE_TYPES,
	type IssueType,
} from "#/lib/issue-types";
import { cn } from "#/lib/utils";

export function IssueTypeIcon({
	type,
	className,
}: {
	type: IssueType;
	className?: string;
}) {
	const info = ISSUE_TYPE_INFO[type];
	return (
		<span
			role="img"
			aria-label={info.label}
			title={info.label}
			className={cn("inline-flex shrink-0", info.className, className)}
		>
			<HugeiconsIcon icon={info.icon} aria-hidden className="size-4" />
		</span>
	);
}

export const ISSUE_TYPE_ITEMS = ISSUE_TYPES.map((type) => ({
	label: ISSUE_TYPE_INFO[type].label,
	value: type,
	icon: (
		<HugeiconsIcon
			icon={ISSUE_TYPE_INFO[type].icon}
			className={cn("size-4 shrink-0", ISSUE_TYPE_INFO[type].className)}
		/>
	),
}));
