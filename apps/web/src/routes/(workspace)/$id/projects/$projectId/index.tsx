import { DragDropProvider } from "@dnd-kit/react";
import type { tables } from "@smelp/db";
import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	BoardFilterBar,
	type BoardFilters,
	UNASSIGNED,
} from "#/components/kanban/board-filters";
import { IssueItem } from "#/components/kanban/issue-item";
import { StateColumn } from "#/components/kanban/state-column";
import { IssueList } from "#/components/project/issue-list";
import { ProjectHeader } from "#/components/project/project-header";
import { usePageTitle } from "#/hooks/use-page-title";
import { issuesQueryOptions, updateIssue } from "#/lib/data/issue";
import { projectQueryOptions } from "#/lib/data/project";
import { projectMembersQueryOptions } from "#/lib/data/project-members";
import { statesQueryOptions } from "#/lib/data/state";
import { toastError } from "#/lib/errors";

const asString = (value: unknown) =>
	typeof value === "string" || typeof value === "number"
		? String(value)
		: undefined;

// Without "view", the page shows the board, so existing links keep working.
type ProjectSearch = BoardFilters & { view?: "list" };

export const Route = createFileRoute("/(workspace)/$id/projects/$projectId/")({
	component: RouteComponent,
	validateSearch: (search: Record<string, unknown>): ProjectSearch => ({
		q: asString(search.q),
		assignee: asString(search.assignee),
		state: asString(search.state),
		view: search.view === "list" ? "list" : undefined,
	}),
	loader: async ({ context: { queryClient }, params: { projectId } }) => {
		await Promise.all([
			queryClient.ensureQueryData(statesQueryOptions({ projectId })),
			queryClient.ensureQueryData(issuesQueryOptions({ projectId })),
			queryClient.ensureQueryData(projectMembersQueryOptions({ projectId })),
		]);
	},
});

function matchesFilters(issue: tables["issue"], filters: BoardFilters) {
	if (filters.q) {
		const query = filters.q.toLowerCase();
		const matches =
			issue.title.toLowerCase().includes(query) ||
			issue.id.toLowerCase().includes(query);
		if (!matches) return false;
	}
	if (filters.assignee === UNASSIGNED) {
		if (issue.assignee) return false;
	} else if (filters.assignee && issue.assignee !== filters.assignee) {
		return false;
	}
	return true;
}

function RouteComponent() {
	const { projectId, id: workspaceId } = Route.useParams();
	const { data: project } = useSuspenseQuery(
		projectQueryOptions({ projectId }),
	);
	usePageTitle(project.name);
	const { view, ...filters } = Route.useSearch();
	const navigate = Route.useNavigate();

	const { data: states } = useSuspenseQuery(statesQueryOptions({ projectId }));
	const { data: issues } = useSuspenseQuery(issuesQueryOptions({ projectId }));
	const { data: members } = useSuspenseQuery(
		projectMembersQueryOptions({ projectId }),
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
		onError: (error, _variables, context) => {
			toastError(error, "Couldn't move the work item. Please try again.");
			if (context?.previousIssues) {
				queryClient.setQueryData(issuesQueryKey, context.previousIssues);
			}
		},
	});

	const visibleIssues = issues.filter((issue) =>
		matchesFilters(issue, filters),
	);
	const visibleStates = filters.state
		? states.filter((state) => state.id === filters.state)
		: states;
	const shownCount = visibleIssues.filter((issue) =>
		visibleStates.some((state) => state.id === issue.state),
	).length;
	const isFiltered = Boolean(filters.q || filters.assignee || filters.state);

	return (
		<div className="flex h-full w-full min-h-0 flex-col overflow-hidden">
			<ProjectHeader
				workspaceId={workspaceId}
				projectId={projectId}
				view={view ?? "board"}
			/>
			<BoardFilterBar
				filters={filters}
				onChange={(next) =>
					navigate({ search: { ...next, view }, replace: true })
				}
				members={members}
				states={states}
			/>
			{isFiltered && shownCount === 0 && (
				<p className="px-4 pt-3 text-sm text-muted-foreground">
					No work items match these filters.
				</p>
			)}
			{view === "list" ? (
				<IssueList
					issues={visibleIssues}
					states={visibleStates}
					members={members}
					workspaceId={workspaceId}
				/>
			) : (
				<DragDropProvider
					onDragEnd={(event) => {
						if (event.canceled) return;

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
					<div className="flex h-full min-h-0 w-full flex-1 gap-8 overflow-x-auto p-4">
						{visibleStates.map((state) => (
							<StateColumn key={state.id} state={state}>
								{visibleIssues
									.filter((issue) => issue.state === state.id)
									.sort((a, b) => b.updatedAt - a.updatedAt)
									.map((issue) => (
										<IssueItem
											issue={issue}
											key={issue.id}
											workspaceId={workspaceId}
											assignee={members.find(
												(member) => member.userId === issue.assignee,
											)}
										/>
									))}
							</StateColumn>
						))}
					</div>
				</DragDropProvider>
			)}
		</div>
	);
}
