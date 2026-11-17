import type { ProjectMember, tables } from "@smelp/db";
import { useEffect, useState } from "react";
import { useDebounce } from "#/hooks/use-debounce";
import {
	type BoardFilters,
	DUE_FILTERS,
	isFiltered,
	NO_CYCLE,
	NO_MODULE,
} from "#/lib/board-filters";
import { isIssuePriority } from "#/lib/issue-priorities";
import { isIssueType } from "#/lib/issue-types";
import { cn } from "#/lib/utils";
import { ISSUE_PRIORITY_ITEMS } from "../issue/issue-priority-icon";
import { ISSUE_TYPE_ITEMS } from "../issue/issue-type-icon";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectItemIcon,
	SelectTrigger,
	SelectValueWithIcon,
} from "../ui/select";
import { AssigneeFilter } from "./assignee-filter";

const ALL = "all";
const FILTER_CONTROL =
	"max-w-44 min-w-0 shrink-0 sm:shrink data-active:border-primary data-active:bg-primary/8";

function FilterSelect({
	label,
	value,
	items,
	onChange,
}: {
	label: string;
	value: string | undefined;
	items: { label: string; value: string; icon?: React.ReactNode }[];
	onChange: (value: string | undefined) => void;
}) {
	return (
		<Select
			items={items}
			value={value ?? ALL}
			onValueChange={(next) =>
				onChange(next == null || next === ALL ? undefined : next)
			}
		>
			<SelectTrigger
				aria-label={label}
				data-active={value !== undefined || undefined}
				className={FILTER_CONTROL}
			>
				<SelectValueWithIcon
					icon={items.find((item) => item.value === value)?.icon}
				/>
			</SelectTrigger>
			<SelectContent>
				{items.map((item) => (
					<SelectItem key={item.value} value={item.value}>
						{item.icon && <SelectItemIcon>{item.icon}</SelectItemIcon>}
						{item.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

export function BoardFilterBar({
	filters,
	onChange,
	members,
	states,
	modules,
	cycles,
	shownCount,
	totalCount,
}: {
	filters: BoardFilters;
	onChange: (filters: BoardFilters) => void;
	members: ProjectMember[];
	states: tables["state"][];
	modules: { id: string; name: string }[];
	cycles: { id: string; name: string }[];
	shownCount: number;
	totalCount: number;
}) {
	const [search, setSearch] = useState(filters.q ?? "");
	const debouncedSearch = useDebounce(search, 200);

	// biome-ignore lint/correctness/useExhaustiveDependencies: only typing should write to the URL
	useEffect(() => {
		const q = debouncedSearch.trim() || undefined;
		if (q !== filters.q) onChange({ ...filters, q });
	}, [debouncedSearch]);

	// Follows the URL when it changes elsewhere, such as Clear or browser back.
	// biome-ignore lint/correctness/useExhaustiveDependencies: the input's own value must not reset it
	useEffect(() => {
		if ((filters.q ?? "") !== search.trim()) setSearch(filters.q ?? "");
	}, [filters.q]);

	return (
		<div className="flex shrink-0 flex-wrap items-center gap-2 px-4 pt-3">
			<div className="-m-1 flex w-[calc(100%+0.5rem)] min-w-0 items-center gap-2 overflow-x-auto p-1 sm:contents">
				<Input
					type="search"
					aria-label="Search work items"
					placeholder="Search by title or ID"
					className="w-56 shrink-0 sm:w-64"
					value={search}
					onChange={(event) => setSearch(event.target.value)}
				/>
				<AssigneeFilter
					value={filters.assignee}
					members={members}
					onChange={(assignee) => onChange({ ...filters, assignee })}
					className={cn(FILTER_CONTROL, "max-w-56")}
				/>
				<FilterSelect
					label="Filter by state"
					value={filters.state}
					onChange={(state) => onChange({ ...filters, state })}
					items={[
						{ label: "All states", value: ALL },
						...states.map((state) => ({ label: state.name, value: state.id })),
					]}
				/>
				<FilterSelect
					label="Filter by type"
					value={filters.type}
					onChange={(type) =>
						onChange({
							...filters,
							type: isIssueType(type) ? type : undefined,
						})
					}
					items={[{ label: "All types", value: ALL }, ...ISSUE_TYPE_ITEMS]}
				/>
				<FilterSelect
					label="Filter by priority"
					value={filters.priority}
					onChange={(priority) =>
						onChange({
							...filters,
							priority: isIssuePriority(priority) ? priority : undefined,
						})
					}
					items={[
						{ label: "All priorities", value: ALL },
						...ISSUE_PRIORITY_ITEMS,
					]}
				/>
				<FilterSelect
					label="Filter by module"
					value={filters.module}
					onChange={(module) => onChange({ ...filters, module })}
					items={[
						{ label: "All modules", value: ALL },
						{ label: "No module", value: NO_MODULE },
						...modules.map((item) => ({ label: item.name, value: item.id })),
					]}
				/>
				{cycles.length > 0 && (
					<FilterSelect
						label="Filter by cycle"
						value={filters.cycle}
						onChange={(cycle) => onChange({ ...filters, cycle })}
						items={[
							{ label: "All cycles", value: ALL },
							{ label: "No cycle", value: NO_CYCLE },
							...cycles.map((cycle) => ({
								label: cycle.name,
								value: cycle.id,
							})),
						]}
					/>
				)}
				<FilterSelect
					label="Filter by due date"
					value={filters.due}
					onChange={(due) =>
						onChange({
							...filters,
							due: DUE_FILTERS.find((value) => value === due),
						})
					}
					items={[
						{ label: "Any due date", value: ALL },
						{ label: "Overdue", value: "overdue" },
						{ label: "Due this week", value: "week" },
					]}
				/>
				<span
					aria-live="polite"
					className="shrink-0 text-sm text-muted-foreground tabular-nums"
				>
					{isFiltered(filters) &&
						`${shownCount} of ${totalCount} ${totalCount === 1 ? "work item" : "work items"}`}
				</span>
				{isFiltered(filters) && (
					<Button
						variant="ghost"
						className="shrink-0"
						onClick={() => onChange({})}
					>
						Clear
					</Button>
				)}
			</div>
		</div>
	);
}
