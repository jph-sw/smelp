import {
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseInfiniteQuery,
} from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Button } from "#/components/ui/button";
import { usePageTitle } from "#/hooks/use-page-title";
import {
	type InboxItem,
	markAllNotificationsRead,
	markNotificationRead,
	notificationsQueryOptions,
	unreadCountQueryOptions,
} from "#/lib/data/notifications";
import { toastError } from "#/lib/errors";
import { cn, formatDate, formatRelativeTime, initials } from "#/lib/utils";

export const Route = createFileRoute("/(workspace)/$id/inbox")({
	component: RouteComponent,
	loader: ({ context: { queryClient }, params: { id } }) =>
		queryClient.ensureInfiniteQueryData(
			notificationsQueryOptions({ workspaceId: id }),
		),
});

function describe(item: InboxItem) {
	switch (item.type) {
		case "assigned":
			return "assigned you";
		case "mention":
			return "mentioned you on";
		case "comment":
			return "commented on";
	}
}

function RouteComponent() {
	usePageTitle("Inbox");
	const { id: workspaceId } = Route.useParams();
	const queryClient = useQueryClient();
	const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
		useSuspenseInfiniteQuery(notificationsQueryOptions({ workspaceId }));

	const items = data.pages.flatMap((page) => page.notifications);
	// From the count, not the loaded pages: unread items may be on pages not loaded yet.
	const { data: unread } = useQuery(unreadCountQueryOptions({ workspaceId }));
	const hasUnread = (unread?.count ?? 0) > 0;

	const refresh = () =>
		Promise.all([
			queryClient.invalidateQueries({
				queryKey: notificationsQueryOptions({ workspaceId }).queryKey,
			}),
			queryClient.invalidateQueries({
				queryKey: unreadCountQueryOptions({ workspaceId }).queryKey,
			}),
		]);

	const { mutate: markRead } = useMutation({
		mutationFn: markNotificationRead,
		onSuccess: refresh,
		onError: (e) => toastError(e),
	});
	const { mutate: markAllRead, isPending: isMarkingAll } = useMutation({
		mutationFn: () => markAllNotificationsRead(workspaceId),
		onSuccess: refresh,
		onError: (e) => toastError(e),
	});

	return (
		<div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-8">
			<div className="flex items-center justify-between gap-4">
				<h1 className="text-xl font-medium">Inbox</h1>
				<Button
					variant="outline"
					size="sm"
					disabled={!hasUnread || isMarkingAll}
					onClick={() => markAllRead()}
				>
					Mark all as read
				</Button>
			</div>
			{items.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					Nothing needs you right now. You'll hear about work assigned to you,
					comments on your work and mentions here.
				</p>
			) : (
				<ol className="space-y-1">
					{items.map((item) => {
						const isUnread = item.readAt === null;
						return (
							<li key={item.id}>
								<Link
									to="/$id/browse/$issueId"
									params={{ id: workspaceId, issueId: item.issueId }}
									onClick={() => isUnread && markRead(item.id)}
									className={cn(
										"flex items-center gap-3 rounded-md p-2 hover:bg-accent",
										isUnread && "bg-secondary",
									)}
								>
									<Avatar size="sm">
										<AvatarImage src={item.actorImage ?? undefined} alt="" />
										<AvatarFallback>{initials(item.actorName)}</AvatarFallback>
									</Avatar>
									<span className="min-w-0 flex-1 text-sm text-muted-foreground [overflow-wrap:anywhere]">
										<span className="font-medium text-foreground">
											{item.actorName ?? "Someone"}
										</span>{" "}
										{describe(item)}{" "}
										<span className="font-medium text-foreground">
											{item.issueId}
										</span>{" "}
										{item.title}
									</span>
									{isUnread && (
										<span
											role="img"
											aria-label="Unread"
											className="size-2 shrink-0 rounded-full bg-primary"
										/>
									)}
									<time
										className="shrink-0 text-xs text-muted-foreground"
										dateTime={new Date(item.createdAt).toISOString()}
										title={formatDate(item.createdAt)}
									>
										{formatRelativeTime(item.createdAt)}
									</time>
								</Link>
							</li>
						);
					})}
				</ol>
			)}
			{hasNextPage && (
				<Button
					variant="outline"
					disabled={isFetchingNextPage}
					onClick={() =>
						fetchNextPage({ throwOnError: true }).catch((e) => toastError(e))
					}
				>
					{isFetchingNextPage ? "Loading…" : "Load more"}
				</Button>
			)}
		</div>
	);
}
