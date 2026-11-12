import type { ProjectMember, tables } from "@smelp/db";
import { useEffect, useState } from "react";
import { useDebounce } from "#/hooks/use-debounce";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../ui/select";

export type BoardFilters = {
	q?: string;
	assignee?: string;
	state?: string;
	cycle?: string;
};

export const UNASSIGNED = "unassigned";
export const NO_CYCLE = "none";
const ALL = "all";

function FilterSelect({
	label,
	value,
	items,
	onChange,
}: {
	label: string;
	value: string | undefined;
	items: { label: string; value: string }[];
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
			<SelectTrigger aria-label={label} className="min-w-0 max-w-44">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{items.map((item) => (
					<SelectItem key={item.value} value={item.value}>
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
	cycles,
}: {
	filters: BoardFilters;
	onChange: (filters: BoardFilters) => void;
	members: ProjectMember[];
	states: tables["state"][];
	cycles: { id: string; name: string }[];
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

	const isFiltered = Boolean(
		filters.q || filters.assignee || filters.state || filters.cycle,
	);

	return (
		<div className="flex shrink-0 flex-wrap items-center gap-2 px-4 pt-3">
			<Input
				type="search"
				aria-label="Search work items"
				placeholder="Search by title or ID"
				className="w-full sm:w-64"
				value={search}
				onChange={(event) => setSearch(event.target.value)}
			/>
			<FilterSelect
				label="Filter by assignee"
				value={filters.assignee}
				onChange={(assignee) => onChange({ ...filters, assignee })}
				items={[
					{ label: "Anyone", value: ALL },
					{ label: "Unassigned", value: UNASSIGNED },
					...members.map((member) => ({
						label: member.displayName,
						value: member.userId,
					})),
				]}
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
			{cycles.length > 0 && (
				<FilterSelect
					label="Filter by cycle"
					value={filters.cycle}
					onChange={(cycle) => onChange({ ...filters, cycle })}
					items={[
						{ label: "All cycles", value: ALL },
						{ label: "No cycle", value: NO_CYCLE },
						...cycles.map((cycle) => ({ label: cycle.name, value: cycle.id })),
					]}
				/>
			)}
			{isFiltered && (
				<Button variant="ghost" onClick={() => onChange({})}>
					Clear
				</Button>
			)}
		</div>
	);
}
