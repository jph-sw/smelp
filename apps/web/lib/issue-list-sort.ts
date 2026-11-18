import type { ProjectMember, tables } from "@smelp/db";
import { ISSUE_PRIORITIES } from "./issue-priorities";

export const LIST_SORT_COLUMNS = [
	"key",
	"title",
	"state",
	"assignee",
	"priority",
	"due",
] as const;
export type ListSortColumn = (typeof LIST_SORT_COLUMNS)[number];

// One value, so a direction can't exist without a column. "-" means descending.
export type ListSort = ListSortColumn | `-${ListSortColumn}`;

type SortableIssue = Pick<
	tables["issue"],
	"id" | "title" | "state" | "assignee" | "priority" | "dueDate" | "updatedAt"
>;

type SortContext = {
	states: Pick<tables["state"], "id">[];
	members: Pick<ProjectMember, "userId" | "displayName">[];
};

type SortLookups = {
	stateOrder: Map<string, number>;
	memberNames: Map<string, string>;
};

type SortValue = string | number | null;

const WELL_FORMED_DAY = /^\d{4}-\d{2}-\d{2}$/;

const SORT_VALUES: Record<
	ListSortColumn,
	(issue: SortableIssue, lookups: SortLookups) => SortValue
> = {
	key: (issue) => issue.id,
	title: (issue) => issue.title,
	state: (issue, { stateOrder }) => stateOrder.get(issue.state) ?? null,
	assignee: (issue, { memberNames }) =>
		(issue.assignee && memberNames.get(issue.assignee)) || null,
	priority: (issue) => ISSUE_PRIORITIES.indexOf(issue.priority),
	due: ({ dueDate }) =>
		dueDate && WELL_FORMED_DAY.test(dueDate)
			? Number(dueDate.replaceAll("-", ""))
			: null,
};

const DESCENDING_FIRST: ReadonlySet<ListSortColumn> = new Set(["priority"]);

const textOrder = new Intl.Collator(undefined, {
	numeric: true,
	sensitivity: "base",
});

function parseListSort(sort: ListSort) {
	const descending = sort.startsWith("-");
	return {
		column: (descending ? sort.slice(1) : sort) as ListSortColumn,
		descending,
	};
}

export function isListSort(value: unknown): value is ListSort {
	if (typeof value !== "string") return false;
	const { column } = parseListSort(value as ListSort);
	return LIST_SORT_COLUMNS.includes(column);
}

export function nextListSort(
	current: ListSort | undefined,
	column: ListSortColumn,
): ListSort | undefined {
	const ascending: ListSort = column;
	const descending: ListSort = `-${column}`;
	const [first, second] = DESCENDING_FIRST.has(column)
		? [descending, ascending]
		: [ascending, descending];
	if (current === first) return second;
	if (current === second) return undefined;
	return first;
}

export function listSortAria(
	sort: ListSort | undefined,
	column: ListSortColumn,
): "ascending" | "descending" | "none" {
	if (!sort) return "none";
	const active = parseListSort(sort);
	if (active.column !== column) return "none";
	return active.descending ? "descending" : "ascending";
}

// Missing values stay last whichever way the column runs.
function compareValues(a: SortValue, b: SortValue, descending: boolean) {
	if (a === null || b === null) {
		if (a === b) return 0;
		return a === null ? 1 : -1;
	}
	const order =
		typeof a === "number" && typeof b === "number"
			? a - b
			: textOrder.compare(String(a), String(b));
	return descending ? -order : order;
}

// Ties keep the board's order whichever way the column runs.
export function sortIssues<Issue extends SortableIssue>(
	issues: readonly Issue[],
	sort: ListSort | undefined,
	{ states, members }: SortContext,
): Issue[] {
	const lookups: SortLookups = {
		stateOrder: new Map(states.map((state, index) => [state.id, index])),
		memberNames: new Map(
			members.map((member) => [member.userId, member.displayName]),
		),
	};
	const active = sort ? parseListSort(sort) : undefined;
	const stateIndex = (issue: Issue) => lookups.stateOrder.get(issue.state) ?? 0;

	return issues
		.filter((issue) => lookups.stateOrder.has(issue.state))
		.map((issue) => ({
			issue,
			value: active ? SORT_VALUES[active.column](issue, lookups) : null,
		}))
		.sort(
			(a, b) =>
				compareValues(a.value, b.value, active?.descending ?? false) ||
				stateIndex(a.issue) - stateIndex(b.issue) ||
				b.issue.updatedAt - a.issue.updatedAt,
		)
		.map(({ issue }) => issue);
}
