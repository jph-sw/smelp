import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { orpc } from "../orpc";

type Cursor = { createdAt: number; id: string };

export const notificationsQueryOptions = ({
	workspaceId,
}: {
	workspaceId: string;
}) =>
	infiniteQueryOptions({
		queryKey: ["notifications", workspaceId],
		queryFn: ({ pageParam }) =>
			orpc.notifications.find({ workspaceId, before: pageParam }),
		initialPageParam: undefined as Cursor | undefined,
		getNextPageParam: (lastPage) => lastPage.next ?? undefined,
	});

export const unreadCountQueryOptions = ({
	workspaceId,
}: {
	workspaceId: string;
}) =>
	queryOptions({
		queryKey: ["notification-count", workspaceId],
		queryFn: () => orpc.notifications.countUnread({ workspaceId }),
		// There is no push channel, so the badge checks in now and then.
		refetchInterval: 30_000,
		refetchOnWindowFocus: true,
	});

export type InboxItem = Awaited<
	ReturnType<typeof orpc.notifications.find>
>["notifications"][number];

export const markNotificationRead = (id: string) =>
	orpc.notifications.markRead({ id });

export const markAllNotificationsRead = (workspaceId: string) =>
	orpc.notifications.markAllRead({ workspaceId });
