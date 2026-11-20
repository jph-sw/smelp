import { ArrowDown02Icon, ArrowUp02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ProjectMember, tables } from "@smelp/db";
import { Link } from "@tanstack/react-router";
import type { MouseEvent as ReactMouseEvent } from "react";
import { formatDay, formatShortDay } from "#/lib/day";
import { isOverdue, localDay } from "#/lib/due-date";
import {
	LIST_SORT_COLUMNS,
	type ListSort,
	type ListSortColumn,
	listSortAria,
	nextListSort,
	parseListSort,
	reverseListSort,
	sortIssues,
} from "#/lib/issue-list-sort";
import { ISSUE_PRIORITY_INFO } from "#/lib/issue-priorities";
import { cn, initials } from "#/lib/utils";
import { IssuePriorityIcon } from "../issue/issue-priority-icon";
import { IssueTypeIcon } from "../issue/issue-type-icon";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Button } from "../ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "../ui/table";

type ListSorting = {
	sort: ListSort | undefined;
	onChange: (sort: ListSort | undefined) => void;
};

const COLUMNS: Record<ListSortColumn, { label: string; className?: string }> = {
	key: { label: "Key", className: "w-28 lg:w-30" },
	title: { label: "Title" },
	state: { label: "State", className: "w-7 sm:w-16 lg:w-28" },
	assignee: { label: "Assignee", className: "w-10 sm:w-24 lg:w-32" },
	priority: {
		label: "Priority",
		className: "hidden w-20 sm:table-cell lg:w-22",
	},
	due: { label: "Due", className: "hidden w-24 sm:table-cell lg:w-32" },
};

const ABOVE_ROW_LINK = "relative z-10 cursor-pointer";
const CELL_HOVER = "transition-colors duration-150 group-hover:bg-muted";

// The row's link covers the row and would hide the cells' tooltips, so anything
// with a tooltip sits above the link and passes its clicks on.
function followRowLink(event: ReactMouseEvent<HTMLTableRowElement>) {
	const link = event.currentTarget.querySelector("a");
	if (link && !link.contains(event.target as Node)) {
		link.dispatchEvent(new MouseEvent("click", event.nativeEvent));
	}
}

function ColumnHeader({
	column,
	sorting,
}: {
	column: ListSortColumn;
	sorting?: ListSorting;
}) {
	const { label, className } = COLUMNS[column];
	const headClassName = cn("h-8 text-xs", className);
	if (!sorting) {
		return <TableHead className={headClassName}>{label}</TableHead>;
	}

	const direction = listSortAria(sorting.sort, column);
	return (
		<TableHead aria-sort={direction} className={headClassName}>
			<Button
				variant="ghost"
				size="sm"
				className={cn(
					"-ms-2 gap-1 text-xs font-medium",
					direction === "none" ? "text-muted-foreground" : "text-foreground",
				)}
				onClick={() => sorting.onChange(nextListSort(sorting.sort, column))}
			>
				{label}
				{direction !== "none" && (
					<HugeiconsIcon
						icon={direction === "ascending" ? ArrowUp02Icon : ArrowDown02Icon}
						aria-hidden
						className="size-3"
					/>
				)}
			</Button>
		</TableHead>
	);
}

const BOARD_ORDER = "board";

// Below sm the header row is hidden, so this bar is the sort control there.
function CompactSortBar({
	sorting: { sort, onChange },
}: {
	sorting: ListSorting;
}) {
	const active = sort ? { sort, ...parseListSort(sort) } : undefined;
	const reverseLabel = active?.descending
		? "Sort ascending"
		: "Sort descending";
	return (
		<div className="-ms-2 mb-1 flex items-center gap-1 sm:hidden">
			<DropdownMenu>
				<DropdownMenuTrigger
					render={<Button variant="ghost" size="sm" className="text-xs" />}
				>
					{active
						? `Sort: ${COLUMNS[active.column].label}`
						: "Sort: Board order"}
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="min-w-40">
					<DropdownMenuGroup>
						<DropdownMenuLabel>Sort by</DropdownMenuLabel>
						<DropdownMenuRadioGroup
							value={active?.column ?? BOARD_ORDER}
							onValueChange={(value) => {
								if (value === BOARD_ORDER) return onChange(undefined);
								const column = value as ListSortColumn;
								if (column !== active?.column) {
									onChange(nextListSort(undefined, column));
								}
							}}
						>
							<DropdownMenuRadioItem value={BOARD_ORDER} closeOnSelect>
								Board order
							</DropdownMenuRadioItem>
							{LIST_SORT_COLUMNS.map((column) => (
								<DropdownMenuRadioItem
									key={column}
									value={column}
									closeOnSelect
								>
									{COLUMNS[column].label}
								</DropdownMenuRadioItem>
							))}
						</DropdownMenuRadioGroup>
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>
			{active && (
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label={reverseLabel}
					title={reverseLabel}
					onClick={() => onChange(reverseListSort(active.sort))}
				>
					<HugeiconsIcon
						icon={active.descending ? ArrowDown02Icon : ArrowUp02Icon}
						aria-hidden
					/>
				</Button>
			)}
		</div>
	);
}

// The board's items as a table, in the board's order unless `sorting` says
// otherwise. With `sorting`, the column headers change the order.
export function IssueList({
	issues,
	states,
	members,
	workspaceId,
	sorting,
}: {
	issues: tables["issue"][];
	states: tables["state"][];
	members: ProjectMember[];
	workspaceId: string;
	sorting?: ListSorting;
}) {
	const rows = sortIssues(issues, sorting?.sort, { states, members });
	const today = localDay();

	if (rows.length === 0) return null;

	return (
		<div className="min-h-0 flex-1 overflow-y-auto p-4">
			{sorting && <CompactSortBar sorting={sorting} />}
			<Table
				aria-label="Work items"
				className="table-fixed border-separate border-spacing-x-0 border-spacing-y-0.5 sm:min-w-[34rem] lg:min-w-[44rem]"
			>
				<TableHeader className="hidden sm:table-header-group">
					<TableRow className="border-0">
						{LIST_SORT_COLUMNS.map((column) => (
							<ColumnHeader key={column} column={column} sorting={sorting} />
						))}
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((issue) => {
						const state = states.find((s) => s.id === issue.state);
						const assignee = members.find(
							(member) => member.userId === issue.assignee,
						);
						const overdue = isOverdue(issue.dueDate, state?.group, today);
						return (
							<TableRow
								key={issue.id}
								className="group relative border-0"
								onClick={followRowLink}
							>
								<TableCell
									className={cn(
										COLUMNS.key.className,
										CELL_HOVER,
										"rounded-s-md",
									)}
								>
									<span className="flex min-w-0 items-center gap-1.5">
										<IssueTypeIcon
											type={issue.type}
											className={ABOVE_ROW_LINK}
										/>
										<span className="truncate text-xs font-semibold text-foreground/70">
											{issue.id}
										</span>
									</span>
								</TableCell>
								<TableCell className={CELL_HOVER}>
									<span className="flex min-w-0 items-center gap-1.5">
										{issue.priority !== "none" && (
											<IssuePriorityIcon
												priority={issue.priority}
												className={cn(ABOVE_ROW_LINK, "sm:hidden")}
											/>
										)}
										<Link
											to="/$id/browse/$issueId"
											params={{ id: workspaceId, issueId: issue.id }}
											className="truncate outline-none after:absolute after:inset-0 after:rounded-md focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
										>
											{issue.title}
										</Link>
										{issue.dueDate && (
											<span
												className={cn(
													ABOVE_ROW_LINK,
													"ms-auto shrink-0 text-xs text-muted-foreground sm:hidden",
													overdue && "font-medium text-destructive",
												)}
												title={`${formatDay(issue.dueDate)}${overdue ? " · Overdue" : ""}`}
											>
												{formatShortDay(issue.dueDate)}
												{overdue && <span className="sr-only"> · Overdue</span>}
											</span>
										)}
									</span>
								</TableCell>
								<TableCell className={cn(COLUMNS.state.className, CELL_HOVER)}>
									<span
										className={cn(
											ABOVE_ROW_LINK,
											"flex w-fit max-w-full items-center gap-2",
										)}
										title={state?.name}
									>
										<span
											className="size-3 shrink-0 rounded-full ring-1 ring-foreground/20"
											style={{ backgroundColor: state?.color }}
										/>
										<span className="hidden truncate text-xs text-muted-foreground lg:inline">
											{state?.name}
										</span>
									</span>
								</TableCell>
								<TableCell
									className={cn(
										COLUMNS.assignee.className,
										CELL_HOVER,
										"max-sm:rounded-e-md",
									)}
								>
									<span
										className={cn(
											ABOVE_ROW_LINK,
											"flex w-fit max-w-full items-center gap-2",
										)}
										title={
											assignee
												? `Assigned to ${assignee.displayName}`
												: "Unassigned"
										}
									>
										{assignee ? (
											<>
												<Avatar size="sm">
													<AvatarImage
														src={assignee.image ?? undefined}
														alt=""
													/>
													<AvatarFallback>
														{initials(assignee.displayName)}
													</AvatarFallback>
												</Avatar>
												<span className="hidden truncate text-xs lg:inline">
													{assignee.displayName}
												</span>
											</>
										) : (
											<span className="hidden text-xs text-muted-foreground lg:inline">
												Unassigned
											</span>
										)}
									</span>
								</TableCell>
								<TableCell
									className={cn(COLUMNS.priority.className, CELL_HOVER)}
								>
									{issue.priority !== "none" && (
										<span className="flex min-w-0 items-center gap-1.5 text-xs">
											<IssuePriorityIcon priority={issue.priority} />
											<span className="hidden truncate lg:inline">
												{ISSUE_PRIORITY_INFO[issue.priority].label}
											</span>
										</span>
									)}
								</TableCell>
								<TableCell
									className={cn(
										COLUMNS.due.className,
										CELL_HOVER,
										"rounded-e-md",
									)}
								>
									{issue.dueDate && (
										<span
											className={cn(
												ABOVE_ROW_LINK,
												"block w-fit max-w-full truncate text-xs text-muted-foreground",
												overdue && "font-medium text-destructive",
											)}
											title={`${formatDay(issue.dueDate)}${overdue ? " · Overdue" : ""}`}
										>
											{formatShortDay(issue.dueDate)}
											{overdue && (
												<span className="sr-only lg:not-sr-only">
													{" "}
													· Overdue
												</span>
											)}
										</span>
									)}
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>
		</div>
	);
}
