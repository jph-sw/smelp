import {
	ArrowDown01Icon,
	ArrowUp01Icon,
	ArrowUpDoubleIcon,
	EqualSignIcon,
	MinusSignIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import type { DEFAULTS, IssuePriority } from "@smelp/db";

export type { IssuePriority };

// Mirrors DEFAULTS.ISSUE_PRIORITIES in @smelp/db, which the API enforces.
export const ISSUE_PRIORITIES = [
	"none",
	"low",
	"medium",
	"high",
	"urgent",
] as const satisfies typeof DEFAULTS.ISSUE_PRIORITIES;

export const ISSUE_PRIORITY_INFO: Record<
	IssuePriority,
	{ label: string; icon: IconSvgElement; className: string }
> = {
	none: {
		label: "None",
		icon: MinusSignIcon,
		className: "text-muted-foreground",
	},
	low: {
		label: "Low",
		icon: ArrowDown01Icon,
		className: "text-sky-600 dark:text-sky-400",
	},
	medium: {
		label: "Medium",
		icon: EqualSignIcon,
		className: "text-amber-600 dark:text-amber-400",
	},
	high: {
		label: "High",
		icon: ArrowUp01Icon,
		className: "text-orange-600 dark:text-orange-400",
	},
	urgent: {
		label: "Urgent",
		icon: ArrowUpDoubleIcon,
		className: "text-red-600 dark:text-red-400",
	},
};

export function isIssuePriority(value: unknown): value is IssuePriority {
	return ISSUE_PRIORITIES.some((priority) => priority === value);
}

export const issuePriorityLabel = (value: string | null | undefined) =>
	isIssuePriority(value)
		? ISSUE_PRIORITY_INFO[value].label
		: "another priority";
