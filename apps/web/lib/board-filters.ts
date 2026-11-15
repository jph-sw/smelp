import type { tables } from "@smelp/db";

export type BoardFilters = {
	q?: string;
	assignee?: string[];
	state?: string;
	cycle?: string;
	module?: string;
};

export const UNASSIGNED = "unassigned";
export const NO_CYCLE = "none";
export const NO_MODULE = "none";

type FilterableIssue = Pick<
	tables["issue"],
	"id" | "title" | "assignee" | "state" | "cycleId" | "moduleId"
>;

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
		state: asString(search.state),
		module: asString(search.module),
		cycle: asString(search.cycle),
	};
}

const matchesRef = (
	wanted: string | undefined,
	none: string,
	actual: string | null,
) => !wanted || (wanted === none ? !actual : actual === wanted);

export function matchesFilters(issue: FilterableIssue, filters: BoardFilters) {
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
	return (
		(!filters.state || issue.state === filters.state) &&
		matchesRef(filters.cycle, NO_CYCLE, issue.cycleId) &&
		matchesRef(filters.module, NO_MODULE, issue.moduleId)
	);
}

export function isFiltered(filters: BoardFilters) {
	return Boolean(
		filters.q ||
			filters.assignee ||
			filters.state ||
			filters.cycle ||
			filters.module,
	);
}
