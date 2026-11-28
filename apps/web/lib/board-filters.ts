import type { tables } from "@smelp/db";
import { isDueThisWeek, isOverdue } from "./due-date";
import { isListSort, type ListSort } from "./issue-list-sort";
import { type IssuePriority, isIssuePriority } from "./issue-priorities";
import { type IssueType, isIssueType } from "./issue-types";

export type BoardFilters = {
	q?: string;
	assignee?: string[];
	label?: string[];
	state?: string;
	type?: IssueType;
	priority?: IssuePriority;
	cycle?: string;
	module?: string;
	due?: DueFilter;
};

export const DUE_FILTERS = ["overdue", "week"] as const;
export type DueFilter = (typeof DUE_FILTERS)[number];

const isDueFilter = (value: unknown): value is DueFilter =>
	DUE_FILTERS.includes(value as DueFilter);

export const UNASSIGNED = "unassigned";
export const NO_CYCLE = "none";
export const NO_MODULE = "none";

type FilterableIssue = Pick<
	tables["issue"],
	| "id"
	| "title"
	| "assignee"
	| "state"
	| "type"
	| "priority"
	| "cycleId"
	| "moduleId"
	| "dueDate"
> & { labelIds: string[] };

type FilterContext = {
	today: string;
	states: Pick<tables["state"], "id" | "group">[];
};

const asString = (value: unknown) =>
	typeof value === "string" || typeof value === "number"
		? String(value)
		: undefined;

// Accepts the single id that older links carried as well as a list.
function asIdList(value: unknown) {
	const ids = (Array.isArray(value) ? value : [value])
		.map(asString)
		.filter((id): id is string => Boolean(id));
	return ids.length > 0 ? [...new Set(ids)] : undefined;
}

export function parseBoardFilters(
	search: Record<string, unknown>,
): BoardFilters {
	return {
		q: asString(search.q),
		assignee: asIdList(search.assignee),
		label: asIdList(search.label),
		state: asString(search.state),
		type: isIssueType(search.type) ? search.type : undefined,
		priority: isIssuePriority(search.priority) ? search.priority : undefined,
		module: asString(search.module),
		cycle: asString(search.cycle),
		due: isDueFilter(search.due) ? search.due : undefined,
	};
}

// Without "view", the page shows the board, so existing links keep working.
export type BoardSearch = BoardFilters & { view?: "list"; sort?: ListSort };

export const parseBoardSearch = (
	search: Record<string, unknown>,
): BoardSearch => ({
	...parseBoardFilters(search),
	view: search.view === "list" ? "list" : undefined,
	sort: isListSort(search.sort) ? search.sort : undefined,
});

const boardSearchKey = (projectId: string) => `smelp.board-search.${projectId}`;

export function rememberBoardSearch(projectId: string, search: BoardSearch) {
	try {
		sessionStorage.setItem(boardSearchKey(projectId), JSON.stringify(search));
	} catch {}
}

/** The view of this project's board last open in this tab. */
export function recallBoardSearch(projectId: string): BoardSearch {
	try {
		const stored = sessionStorage.getItem(boardSearchKey(projectId));
		return stored ? parseBoardSearch(JSON.parse(stored)) : {};
	} catch {
		return {};
	}
}

const matchesRef = (
	wanted: string | undefined,
	none: string,
	actual: string | null,
) => !wanted || (wanted === none ? !actual : actual === wanted);

export function matchesFilters(
	issue: FilterableIssue,
	filters: BoardFilters,
	{ today, states }: FilterContext,
) {
	if (filters.q) {
		const query = filters.q.toLowerCase();
		const matches =
			issue.title.toLowerCase().includes(query) ||
			issue.id.toLowerCase().includes(query);
		if (!matches) return false;
	}
	if (
		filters.assignee &&
		!filters.assignee.some((assignee) =>
			matchesRef(assignee, UNASSIGNED, issue.assignee),
		)
	) {
		return false;
	}
	if (
		filters.label &&
		!filters.label.some((label) => issue.labelIds.includes(label))
	) {
		return false;
	}
	if (filters.due) {
		const group = states.find((state) => state.id === issue.state)?.group;
		const isDue = filters.due === "overdue" ? isOverdue : isDueThisWeek;
		if (!isDue(issue.dueDate, group, today)) return false;
	}
	return (
		(!filters.state || issue.state === filters.state) &&
		(!filters.type || issue.type === filters.type) &&
		(!filters.priority || issue.priority === filters.priority) &&
		matchesRef(filters.cycle, NO_CYCLE, issue.cycleId) &&
		matchesRef(filters.module, NO_MODULE, issue.moduleId)
	);
}

export function isFiltered(filters: BoardFilters) {
	return Boolean(
		filters.q ||
			filters.assignee ||
			filters.label ||
			filters.state ||
			filters.type ||
			filters.priority ||
			filters.cycle ||
			filters.module ||
			filters.due,
	);
}
