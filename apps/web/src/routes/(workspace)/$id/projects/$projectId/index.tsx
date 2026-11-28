import { DragDropProvider } from "@dnd-kit/react";
import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
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
		onMutate: async ({ id, state }) => {
			await queryClient.cancelQueries({ queryKey: issuesQueryKey });

			const previousIssues = queryClient.getQueryData(issuesQueryKey);

			queryClient.setQueryData(issuesQueryKey, (current) =>
				current
					?.map((issue) =>
						issue.id === id && state
							? { ...issue, state, updatedAt: Date.now() }
							: issue,
					)
					.sort((a, b) => b.updatedAt - a.updatedAt),
			);

			return { previousIssues };
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
	const visibleIssues = issues.filter((issue) =>
		matchesFilters(issue, filters, { today, states }),
	);
	const visibleStates = filters.state
		? states.filter((state) => state.id === filters.state)
		: states;
	const shownCount = visibleIssues.filter((issue) =>
		visibleStates.some((state) => state.id === issue.state),
	).length;

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
				shownCount={shownCount}
				totalCount={issues.length}
			/>
			{isFiltered(filters) && shownCount === 0 && (
				<p className="px-4 pt-3 text-sm text-muted-foreground">
					No work items match these filters.
				</p>
			)}
			{view === "list" ? (
				<IssueList
					issues={visibleIssues}
					states={visibleStates}
					members={members}
					labels={labels}
					workspaceId={workspaceId}
					sorting={{
						sort,
						onChange: (next) =>
							navigate({ search: { ...search, sort: next }, replace: true }),
					}}
				/>
			) : (
				<DragDropProvider
					onDragEnd={(event) => {
						if (event.canceled || !canWrite) return;

						const issueId = event.operation.source?.id;
						const targetStateId = event.operation.target?.id;

						if (!issueId || !targetStateId) return;

						const issue = issues.find((issue) => issue.id === issueId);
						if (!issue || issue.state === targetStateId) return;

						moveIssue({
							id: issueId.toString(),
							state: targetStateId.toString(),
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
									// Filtering to a state must show it, whatever was collapsed.
									collapsed={!filters.state && collapsedStates.has(state.id)}
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
									{visibleIssues
										.filter((issue) => issue.state === state.id)
										.sort((a, b) => b.updatedAt - a.updatedAt)
										.map((issue) => (
											<IssueItem
												issue={issue}
												key={issue.id}
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
