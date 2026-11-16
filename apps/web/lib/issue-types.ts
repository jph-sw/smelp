import {
	Bookmark02Icon,
	Bug02Icon,
	CheckmarkSquare02Icon,
	FlashIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import type { DEFAULTS, IssueType } from "@smelp/db";

export type { IssueType };

// Mirrors DEFAULTS.ISSUE_TYPES in @smelp/db, which the API enforces.
export const ISSUE_TYPES = [
	"task",
	"bug",
	"story",
	"epic",
] as const satisfies typeof DEFAULTS.ISSUE_TYPES;

export const ISSUE_TYPE_INFO: Record<
	IssueType,
	{ label: string; icon: IconSvgElement; className: string }
> = {
	task: {
		label: "Task",
		icon: CheckmarkSquare02Icon,
		className: "text-sky-600 dark:text-sky-400",
	},
	bug: {
		label: "Bug",
		icon: Bug02Icon,
		className: "text-red-600 dark:text-red-400",
	},
	story: {
		label: "Story",
		icon: Bookmark02Icon,
		className: "text-emerald-600 dark:text-emerald-400",
	},
	epic: {
		label: "Epic",
		icon: FlashIcon,
		className: "text-violet-600 dark:text-violet-400",
	},
};

export function isIssueType(value: unknown): value is IssueType {
	return ISSUE_TYPES.some((type) => type === value);
}

export const issueTypeLabel = (value: string | null | undefined) =>
	isIssueType(value) ? ISSUE_TYPE_INFO[value].label : "another type";
