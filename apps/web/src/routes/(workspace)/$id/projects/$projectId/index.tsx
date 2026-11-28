import { DragDropProvider } from "@dnd-kit/react";
import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { openCreateIssueDialog } from "#/components/issue/create-issue-dialog-store";
import { BoardFilterBar } from "#/components/kanban/board-filters";
import { IssueItem } from "#/components/kanban/issue-item";
import { StateColumn } from "#/components/kanban/state-column";
import { labelsOf } from "#/components/label/label-chips";
import { ArchivedBanner } from "#/components/project/archived-banner";
import { IssueList } from "#/components/project/issue-list";
import { ProjectHeader } from "#/components/project/project-header";
import { usePageTitle } from "#/hooks/use-page-title";
import {
	CURRENT_CYCLE,
	isFiltered,
	matchesFilters,
	parseBoardSearch,
	rememberBoardSearch,
} from "#/lib/board-filters";
import { useCollapsedStates } from "#/lib/collapsed-states";
import { cyclesQueryOptions, invalidateCycles } from "#/lib/data/cycle";
import { issuesQueryOptions, updateIssue } from "#/lib/data/issue";
import { labelsQueryOptions } from "#/lib/data/label";
import { moduleQueryKeys, modulesQueryOptions } from "#/lib/data/module";
import { projectQueryOptions } from "#/lib/data/project";
import {
	projectMembersQueryOptions,
	useProjectAccess,
} from "#/lib/data/project-members";
import { statesQueryOptions } from "#/lib/data/state";
import { isOverdue, localDay } from "#/lib/due-date";
import { toastError } from "#/lib/errors";
import {
	byRank,
	type Columns,
	columnsOf,
	moveCard,
	type Placement,
	placementIn,
	provisionalRank,
} from "#/lib/rank";

export const Route = createFileRoute("/(workspace)/$id/projects/$projectId/")({
	component: RouteComponent,
	validateSearch: parseBoardSearch,
	loader: async ({ context: { queryClient }, params: { projectId } }) => {
		await Promise.all([
			queryClient.ensureQueryData(statesQueryOptions({ projectId })),
			queryClient.ensureQueryData(issuesQueryOptions({ projectId })),
			queryClient.ensureQueryData(projectMembersQueryOptions({ projectId })),
			queryClient.ensureQueryData(modulesQueryOptions({ projectId })),
			queryClient.ensureQueryData(cyclesQueryOptions({ projectId })),
			queryClient.ensureQueryData(labelsQueryOptions({ projectId })),
		]);
	},
});

function RouteComponent() {
	const { projectId, id: workspaceId } = Route.useParams();
	const { data: project } = useSuspenseQuery(
		projectQueryOptions({ projectId }),
	);
	usePageTitle(project.name);
	const search = Route.useSearch();
	const { view, sort, ...filters } = search;
	const navigate = Route.useNavigate();

	useEffect(() => {
		rememberBoardSearch(projectId, search);
	}, [projectId, search]);

	const { data: states } = useSuspenseQuery(statesQueryOptions({ projectId }));
	const { data: issues } = useSuspenseQuery(issuesQueryOptions({ projectId }));
	const { data: members } = useSuspenseQuery(
		projectMembersQueryOptions({ projectId }),
	);
	const { data: modules } = useSuspenseQuery(
		modulesQueryOptions({ projectId }),
	);
	const { data: cycles } = useSuspenseQuery(cyclesQueryOptions({ projectId }));
	const { data: labels } = useSuspenseQuery(labelsQueryOptions({ projectId }));

	const isArchived = project.archivedAt !== null;
	// Guests can look but not move cards, and nobody moves them while archived.
	const { canWrite, user } = useProjectAccess(projectId);
	const [collapsedStates, toggleCollapsedState] = useCollapsedStates(
		user?.id,
		projectId,
	);

	const queryClient = useQueryClient();
	const issuesQueryKey = issuesQueryOptions({ projectId }).queryKey;

	const { mutate: moveIssue } = useMutation({
		mutationFn: updateIssue,
		onMutate: async ({ id, state, before, after }) => {
			await queryClient.cancelQueries({ queryKey: issuesQueryKey });

			const previousIssues = queryClient.getQueryData(issuesQueryKey);
			const placement: Placement | undefined = before
				? { before }
				: after
					? { after }
					: undefined;

			queryClient.setQueryData(issuesQueryKey, (current) => {
				if (!current) return current;
				const rank = placement && provisionalRank(current, id, placement);
				return current
					.map((issue) =>
						issue.id === id
							? {
									...issue,
									...(state && { state, updatedAt: Date.now() }),
									...(rank && { rank }),
								}
							: issue,
					)
					.sort(byRank);
			});

			return { previousIssues };
		},
		onSuccess: (saved) => {
			queryClient.setQueryData(issuesQueryKey, (current) =>
				current
					?.map((issue) =>
						issue.id === saved.id ? { ...issue, ...saved } : issue,
					)
					.sort(byRank),
			);
		},
		// Progress of cycles and modules follows the state of their items.
		onSettled: () =>
			Promise.all([
				invalidateCycles(queryClient, projectId),
				...moduleQueryKeys(projectId).map((queryKey) =>
					queryClient.invalidateQueries({ queryKey }),
				),
			]),
		onError: (error, _variables, context) => {
			toastError(error, "Couldn't move the work item. Please try again.");
			if (context?.previousIssues) {
				queryClient.setQueryData(issuesQueryKey, context.previousIssues);
			}
		},
	});

	const today = localDay();
	const currentCycleId =
		cycles.find((cycle) => cycle.status === "current")?.id ?? null;
	const visibleIssues = issues.filter((issue) =>
		matchesFilters(issue, filters, { today, states, currentCycleId }),
	);
	const visibleStates = filters.state
		? states.filter((state) => state.id === filters.state)
		: states;
	const shownCount = visibleIssues.filter((issue) =>
		visibleStates.some((state) => state.id === issue.state),
	).length;

	// While a card is dragged, the columns show where it would land.
	const [dragColumns, setDragColumns] = useState<Columns | null>(null);
	const dragColumnsRef = useRef<Columns | null>(null);
	const pickedUpColumns = useRef<Columns | null>(null);
	const showDragColumns = (next: Columns | null) => {
		dragColumnsRef.current = next;
		setDragColumns(next);
	};
	const columns =
		dragColumns ??
		columnsOf(
			visibleIssues,
			visibleStates.map((state) => state.id),
		);
	const issueById = new Map(issues.map((issue) => [issue.id, issue]));
	// Filtering to a state must show it, whatever was collapsed.
	const isCollapsed = (stateId: string) =>
		!filters.state && collapsedStates.has(stateId);
	const firstIssue = issues[0];
	const lastIssue = issues.at(-1);

	return (
		<div className="flex h-full w-full min-h-0 flex-col overflow-hidden">
			<ProjectHeader
				workspaceId={workspaceId}
				projectId={projectId}
				view={view ?? "board"}
			/>
			{isArchived && <ArchivedBanner className="mx-4 mt-3" />}
			<BoardFilterBar
				filters={filters}
				onChange={(next) =>
					navigate({ search: { ...next, view, sort }, replace: true })
				}
				members={members}
				states={states}
				modules={modules}
				cycles={cycles}
				labels={labels}
				shownCount={shownCount}
				totalCount={issues.length}
			/>
			{isFiltered(filters) && shownCount === 0 && (
				<p className="px-4 pt-3 text-sm text-muted-foreground">
					{filters.cycle === CURRENT_CYCLE && !currentCycleId ? (
						<>
							No cycle is running right now.{" "}
							<Link
								to="/$id/projects/$projectId/cycles"
								params={{ id: workspaceId, projectId }}
								className="underline underline-offset-3"
							>
								See cycles
							</Link>
						</>
					) : (
						"No work items match these filters."
					)}
				</p>
			)}
			{view === "list" ? (
				<IssueList
					issues={visibleIssues}
					states={visibleStates}
					members={members}
					labels={labels}
					workspaceId={workspaceId}
					reorder={
						canWrite && firstIssue && lastIssue
							? {
									firstId: firstIssue.id,
									lastId: lastIssue.id,
									onMove: (id, placement) => moveIssue({ id, ...placement }),
								}
							: undefined
					}
					sorting={{
						sort,
						onChange: (next) =>
							navigate({ search: { ...search, sort: next }, replace: true }),
					}}
				/>
			) : (
				<DragDropProvider
					onDragStart={() => {
						pickedUpColumns.current = columns;
						showDragColumns(columns);
					}}
					onDragOver={(event) => {
						// The columns follow the card through React, not by moving DOM nodes.
						event.preventDefault();
						const { source, target } = event.operation;
						const current = dragColumnsRef.current;
						// A collapsed column shows no cards, so the card can't be shown in it.
						if (
							!source ||
							!target ||
							!current ||
							isCollapsed(String(target.id))
						) {
							return;
						}
						const next = moveCard(
							current,
							String(source.id),
							String(target.id),
						);
						if (next !== current) showDragColumns(next);
					}}
					onDragEnd={(event) => {
						const dropped = dragColumnsRef.current;
						showDragColumns(null);
						const issueId = event.operation.source?.id;
						if (event.canceled || !canWrite || !dropped || !issueId) return;

						const issue = issueById.get(String(issueId));
						const targetId = String(event.operation.target?.id);
						if (issue && isCollapsed(targetId)) {
							if (issue.state !== targetId) {
								moveIssue({ id: issue.id, state: targetId });
							}
							return;
						}
						const pickedUp = pickedUpColumns.current;
						const before = pickedUp && placementIn(pickedUp, String(issueId));
						const after = placementIn(dropped, String(issueId));
						if (!issue || !before || !after) return;
						if (
							after.stateId === before.stateId &&
							after.index === before.index
						) {
							return;
						}

						moveIssue({
							id: issue.id,
							state: after.stateId === issue.state ? undefined : after.stateId,
							...after.placement,
						});
					}}
				>
					<div className="relative flex min-h-0 w-full flex-1">
						{project.backgroundImage && (
							<img
								src={project.backgroundImage}
								alt=""
								aria-hidden
								className="pointer-events-none absolute inset-0 size-full object-cover opacity-15 select-none mask-t-from-[calc(100%-10rem)] dark:opacity-10"
							/>
						)}
						<div className="relative flex h-full min-h-0 w-full flex-1 gap-3 overflow-x-auto p-4 pointer-coarse:snap-x pointer-coarse:snap-proximity pointer-coarse:scroll-px-4 pointer-coarse:overscroll-x-contain sm:gap-8">
							{visibleStates.map((state) => (
								<StateColumn
									key={state.id}
									state={state}
									collapsed={isCollapsed(state.id)}
									onToggleCollapsed={
										filters.state
											? undefined
											: () => toggleCollapsedState(state.id)
									}
									onCreate={
										canWrite
											? () =>
													openCreateIssueDialog({
														workspaceId,
														projectId,
														projectName: project.name,
														destination: {
															kind: "state",
															id: state.id,
															name: state.name,
														},
													})
											: undefined
									}
								>
									{(columns[state.id] ?? [])
										.flatMap((id) => issueById.get(id) ?? [])
										.map((issue, index) => (
											<IssueItem
												issue={issue}
												key={issue.id}
												column={state.id}
												index={index}
												workspaceId={workspaceId}
												draggable={canWrite}
												overdue={isOverdue(issue.dueDate, state.group, today)}
												states={states}
												onMove={(stateId) =>
													moveIssue({ id: issue.id, state: stateId })
												}
												assignee={members.find(
													(member) => member.userId === issue.assignee,
												)}
												labels={labelsOf(labels, issue.labelIds)}
											/>
										))}
								</StateColumn>
							))}
						</div>
					</div>
				</DragDropProvider>
			)}
		</div>
	);
}
