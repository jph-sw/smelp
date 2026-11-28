import type { tables } from "@smelp/db";
import {
	type QueryClient,
	queryOptions,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import { toastError } from "../errors";
import { orpc } from "../orpc";
import { issueQueryOptions, issuesQueryOptions } from "./issue";

export type Label = tables["label"];

export const labelsQueryOptions = ({ projectId }: { projectId: string }) =>
	queryOptions({
		queryKey: ["labels", projectId],
		queryFn: () => orpc.labels.find({ projectId }),
	});

export const createLabel = (input: {
	projectId: string;
	name: string;
	color: string;
}) => orpc.labels.create(input);

export const updateLabel = (input: {
	id: string;
	name?: string;
	color?: string;
}) => orpc.labels.update(input);

export const deleteLabel = (input: { id: string }) => orpc.labels.delete(input);

// Deleting a label takes it off every item, so the items refresh with it.
export const invalidateLabels = (queryClient: QueryClient, projectId: string) =>
	Promise.all([
		queryClient.invalidateQueries({ queryKey: ["labels", projectId] }),
		queryClient.invalidateQueries({ queryKey: ["issues", projectId] }),
		queryClient.invalidateQueries({ queryKey: ["issue"] }),
	]);

export function useSetIssueLabels({
	issueId,
	projectId,
}: {
	issueId: string;
	projectId: string;
}) {
	const queryClient = useQueryClient();
	const issueKey = issueQueryOptions({ issueId }).queryKey;
	const issuesKey = issuesQueryOptions({ projectId }).queryKey;

	return useMutation({
		mutationFn: (labelIds: string[]) =>
			orpc.issue.setLabels({ id: issueId, labelIds }),
		onMutate: async (labelIds) => {
			await Promise.all([
				queryClient.cancelQueries({ queryKey: issueKey }),
				queryClient.cancelQueries({ queryKey: issuesKey }),
			]);
			queryClient.setQueryData(
				issueKey,
				(current) => current && { ...current, labelIds },
			);
			queryClient.setQueryData(issuesKey, (current) =>
				current?.map((item) =>
					item.id === issueId ? { ...item, labelIds } : item,
				),
			);
		},
		onError: (e) => toastError(e, "Couldn't save the labels."),
		onSettled: () =>
			Promise.all(
				[issueKey, issuesKey, ["activity", issueId]].map((queryKey) =>
					queryClient.invalidateQueries({ queryKey }),
				),
			),
	});
}
