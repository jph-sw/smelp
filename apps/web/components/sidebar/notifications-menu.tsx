import { Notification01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { Link, useMatchRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Button } from "#/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTitle,
	PopoverTrigger,
} from "#/components/ui/popover";
import {
	type InboxItem,
	markAllNotificationsRead,
	markNotificationRead,
	notificationsQueryOptions,
	unreadCountQueryOptions,
} from "#/lib/data/notifications";
import { toastError } from "#/lib/errors";
import { cn, formatDate, formatRelativeTime, initials } from "#/lib/utils";

function describe(item: InboxItem) {
	switch (item.type) {
		case "assigned":
			return "assigned you";
		case "mention":
			return "mentioned you on";
		case "comment":
			return "commented on";
		case "status_changed":
			return "changed the state of";
	}
}

// A row keeps its last comment when a later event updates it, so only these
// kinds are about that comment.
const linkedCommentId = (item: InboxItem) =>
	item.type === "mention" || item.type === "comment"
		? (item.commentId ?? undefined)
		: undefined;

export function NotificationsMenu({ workspaceId }: { workspaceId: string }) {
	const [isOpen, setIsOpen] = useState(false);
	const { data: unread } = useQuery(unreadCountQueryOptions({ workspaceId }));
	const unreadCount = unread?.count ?? 0;

	return (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
			<PopoverTrigger
				aria-label={unreadCount > 0 ? `Inbox, ${unreadCount} unread` : "Inbox"}
				render={<Button variant="ghost" size="icon-lg" className="relative" />}
			>
				<HugeiconsIcon icon={Notification01Icon} />
				{unreadCount > 0 && (
					<span
						aria-hidden
						className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground tabular-nums"
					>
						{unreadCount > 99 ? "99+" : unreadCount}
					</span>
				)}
			</PopoverTrigger>
			<PopoverContent
				align="end"
				className="w-[min(24rem,calc(100vw-2rem))] gap-0 p-0"
			>
				{isOpen && (
					<InboxList
						workspaceId={workspaceId}
						hasUnread={unreadCount > 0}
						onNavigate={() => setIsOpen(false)}
					/>
				)}
			</PopoverContent>
		</Popover>
	);
}

function InboxList({
	workspaceId,
	hasUnread,
	onNavigate,
}: {
	workspaceId: string;
	hasUnread: boolean;
	onNavigate: () => void;
}) {
	const queryClient = useQueryClient();
	const matchRoute = useMatchRoute();
	const { data, isPending, fetchNextPage, hasNextPage, isFetchingNextPage } =
		useInfiniteQuery(notificationsQueryOptions({ workspaceId }));
	const items = data?.pages.flatMap((page) => page.notifications) ?? [];

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
		<>
			<div className="flex items-center justify-between gap-4 border-b px-4 py-2">
				<PopoverTitle className="font-medium">Inbox</PopoverTitle>
				<Button
					variant="ghost"
					size="sm"
					disabled={!hasUnread || isMarkingAll}
					onClick={() => markAllRead()}
				>
					Mark all as read
				</Button>
			</div>
			<div className="max-h-[min(28rem,70dvh)] overflow-y-auto p-1">
				{isPending ? (
					<p className="p-3 text-sm text-muted-foreground">Loading…</p>
				) : items.length === 0 ? (
					<p className="p-3 text-sm text-muted-foreground">
						Nothing needs you right now. You'll hear here when you're assigned
						or mentioned, and about comments and state changes on items you
						watch.
					</p>
				) : (
					<ol className="space-y-1">
						{items.map((item) => {
							const isUnread = item.readAt === null;
							const comment = linkedCommentId(item);
							const params = { id: workspaceId, issueId: item.issueId };
							return (
								<li key={item.id}>
									<Link
										to="/$id/browse/$issueId"
										params={params}
										search={{ comment }}
										// The router ignores a link to the current URL unless its
										// state differs, and this one should reveal the comment again.
										state={
											comment
												? (state) => ({ ...state, openedAt: Date.now() })
												: undefined
										}
										replace={
											!!comment &&
											!!matchRoute({
												to: "/$id/browse/$issueId",
												params,
												search: { comment },
												includeSearch: true,
											})
										}
										onClick={() => {
											if (isUnread) markRead(item.id);
											onNavigate();
										}}
										className={cn(
											"flex items-start gap-3 rounded-md p-2 hover:bg-accent",
											isUnread && "bg-secondary",
										)}
									>
										<Avatar size="sm">
											<AvatarImage src={item.actorImage ?? undefined} alt="" />
											<AvatarFallback>
												{initials(item.actorName)}
											</AvatarFallback>
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
											<time
												className="block text-xs"
												dateTime={new Date(item.createdAt).toISOString()}
												title={formatDate(item.createdAt)}
											>
												{formatRelativeTime(item.createdAt)}
											</time>
										</span>
										{isUnread && (
											<span
												role="img"
												aria-label="Unread"
												className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
											/>
										)}
									</Link>
								</li>
							);
						})}
					</ol>
				)}
				{hasNextPage && (
					<Button
						variant="ghost"
						className="mt-1 w-full"
						disabled={isFetchingNextPage}
						onClick={() =>
							fetchNextPage({ throwOnError: true }).catch((e) => toastError(e))
						}
					>
						{isFetchingNextPage ? "Loading…" : "Load more"}
					</Button>
				)}
			</div>
		</>
	);
}
