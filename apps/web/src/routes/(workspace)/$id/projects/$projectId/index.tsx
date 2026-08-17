import { DragDropProvider } from "@dnd-kit/react";
import type { tables } from "@smelp/db";
import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { IssueItem } from "#/components/kanban/issue-item";
import { StateColumn } from "#/components/kanban/state-column";
import { issuesQueryOptions, updateIssue } from "#/lib/data/issue";
import { statesQueryOptions } from "#/lib/data/state";
import { cn } from "#/lib/utils";

export const Route = createFileRoute("/(workspace)/$id/projects/$projectId/")({
	component: RouteComponent,
	loader: async ({ context: { queryClient }, params: { projectId } }) => {
		await Promise.all([
			queryClient.ensureQueryData(statesQueryOptions({ projectId })),
			queryClient.ensureQueryData(issuesQueryOptions({ projectId })),
		]);
	},
});

function RouteComponent() {
	const { projectId } = Route.useParams();

	const { data: states } = useSuspenseQuery(statesQueryOptions({ projectId }));
	const { data: issues } = useSuspenseQuery(issuesQueryOptions({ projectId }));

	const queryClient = useQueryClient();
	const issuesQueryKey = issuesQueryOptions({ projectId }).queryKey;

	const { mutate: moveIssue } = useMutation({
		mutationFn: updateIssue,
		onMutate: async ({ id, state }) => {
			await queryClient.cancelQueries({ queryKey: issuesQueryKey });

			const previousIssues =
				queryClient.getQueryData<tables["issue"][]>(issuesQueryKey);

			queryClient.setQueryData<tables["issue"][]>(issuesQueryKey, (current) =>
				current?.map((issue) =>
					issue.id === id ? { ...issue, state } : issue,
				),
			);

			return { previousIssues };
		},
		onError: (error, _variables, context) => {
			console.error("Failed to update issue state", error);
			if (context?.previousIssues) {
				queryClient.setQueryData(issuesQueryKey, context.previousIssues);
			}
		},
	});

	return (
		<div className="h-full w-full">
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
				<div className={cn("gap-8 h-full w-full flex  p-4")}>
					{states.map((state) => (
						<StateColumn key={state.id} state={state}>
							{issues
								.filter((issue) => issue.state === state.id)
								.map((issue) => (
									<IssueItem issue={issue} key={issue.id} />
								))}
						</StateColumn>
					))}
				</div>
			</DragDropProvider>
		</div>
	);
}
