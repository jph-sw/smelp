import { infiniteQueryOptions } from "@tanstack/react-query";
import { orpc } from "../orpc";

type Cursor = { createdAt: number; id: string };

export const workspaceActivityQueryOptions = ({
	workspaceId,
}: {
	workspaceId: string;
}) =>
	infiniteQueryOptions({
		queryKey: ["workspace-activity", workspaceId],
		queryFn: ({ pageParam }) =>
			orpc.activity.findWorkspace({ workspaceId, before: pageParam }),
		initialPageParam: undefined as Cursor | undefined,
		getNextPageParam: (lastPage) => lastPage.next ?? undefined,
	});

export type FeedEvent = Awaited<
	ReturnType<typeof orpc.activity.findWorkspace>
>["events"][number];
