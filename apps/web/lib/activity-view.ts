import { useState } from "react";

export const ACTIVITY_FILTERS = {
	all: "All activity",
	comments: "Comments",
	history: "History",
} as const;

export const ACTIVITY_SORTS = {
	newest: "Newest first",
	oldest: "Oldest first",
} as const;

export type ActivityFilter = keyof typeof ACTIVITY_FILTERS;
export type ActivitySort = keyof typeof ACTIVITY_SORTS;
export type ActivityView = { filter: ActivityFilter; sort: ActivitySort };

const DEFAULT_VIEW: ActivityView = { filter: "all", sort: "newest" };
const STORAGE_KEY = "smelp.activity-view";

export const isActivityFilter = (value: unknown): value is ActivityFilter =>
	typeof value === "string" && Object.hasOwn(ACTIVITY_FILTERS, value);

export const isActivitySort = (value: unknown): value is ActivitySort =>
	typeof value === "string" && Object.hasOwn(ACTIVITY_SORTS, value);

export function readActivityView(): ActivityView {
	try {
		const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
		return {
			filter: isActivityFilter(stored?.filter)
				? stored.filter
				: DEFAULT_VIEW.filter,
			sort: isActivitySort(stored?.sort) ? stored.sort : DEFAULT_VIEW.sort,
		};
	} catch {
		return DEFAULT_VIEW;
	}
}

const KIND_FOR_FILTER = {
	all: null,
	comments: "comment",
	history: "activity",
} as const satisfies Record<ActivityFilter, string | null>;

export function arrangeTimeline<T extends { kind: string; createdAt: number }>(
	entries: T[],
	{ filter, sort }: ActivityView,
): T[] {
	const kind = KIND_FOR_FILTER[filter];
	const direction = sort === "newest" ? -1 : 1;
	return entries
		.filter((entry) => kind === null || entry.kind === kind)
		.sort((a, b) => direction * (a.createdAt - b.createdAt));
}

/** A link to a comment shows it even if History is saved, until the viewer picks a filter. */
export function displayedActivityFilter(
	saved: ActivityFilter,
	{
		revealsComment,
		pickedSinceArrival,
	}: { revealsComment: boolean; pickedSinceArrival: boolean },
): ActivityFilter {
	return saved === "history" && revealsComment && !pickedSinceArrival
		? "all"
		: saved;
}

/** The viewer's last choice, kept in this browser for every work item. */
export function useActivityView() {
	const [view, setView] = useState(readActivityView);
	const update = (next: Partial<ActivityView>) => {
		const merged = { ...view, ...next };
		setView(merged);
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
		} catch {}
	};
	return [view, update] as const;
}
