import { useSuspenseInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ActivitySentence } from "#/components/activity/activity-sentence";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Button } from "#/components/ui/button";
import { usePageTitle } from "#/hooks/use-page-title";
import {
	type FeedEvent,
	workspaceActivityQueryOptions,
} from "#/lib/data/activity";
import { toastError } from "#/lib/errors";
import { formatRelativeTime, initials } from "#/lib/utils";

export const Route = createFileRoute("/(workspace)/$id/activity")({
	component: RouteComponent,
	loader: ({ context: { queryClient }, params: { id } }) =>
		queryClient.ensureInfiniteQueryData(
			workspaceActivityQueryOptions({ workspaceId: id }),
		),
});

const dayKey = (time: number) => new Date(time).toDateString();

function dayLabel(time: number) {
	const today = new Date();
	const yesterday = new Date(today);
	yesterday.setDate(today.getDate() - 1);
	if (dayKey(time) === today.toDateString()) return "Today";
	if (dayKey(time) === yesterday.toDateString()) return "Yesterday";
	return new Intl.DateTimeFormat(undefined, {
		weekday: "long",
		day: "numeric",
		month: "long",
		year:
			new Date(time).getFullYear() === today.getFullYear()
				? undefined
				: "numeric",
	}).format(time);
}

function groupByDay(events: FeedEvent[]) {
	const days: { key: string; label: string; events: FeedEvent[] }[] = [];
	for (const event of events) {
		const key = dayKey(event.createdAt);
		const day = days.at(-1);
		if (day?.key === key) day.events.push(event);
		else days.push({ key, label: dayLabel(event.createdAt), events: [event] });
	}
	return days;
}

const fullTime = (time: number) =>
	new Intl.DateTimeFormat(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(time);

function RouteComponent() {
	usePageTitle("Activity");
	const { id: workspaceId } = Route.useParams();
	const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
		useSuspenseInfiniteQuery(workspaceActivityQueryOptions({ workspaceId }));

	const events = data.pages.flatMap((page) => page.events);
	const days = groupByDay(events);

	return (
		<div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-8">
			<h1 className="text-xl font-medium">Activity</h1>
			{events.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					Nothing has happened here yet that you can see.
				</p>
			) : (
				days.map((day) => (
					<section key={day.key} className="space-y-1" aria-label={day.label}>
						<h2 className="text-xs font-medium text-muted-foreground">
							{day.label}
						</h2>
						<ol>
							{day.events.map((event) => (
								<li
									key={event.id}
									className="flex items-center gap-3 rounded-md p-2"
								>
									<Avatar size="sm">
										<AvatarImage src={event.actorImage ?? undefined} alt="" />
										<AvatarFallback>{initials(event.actorName)}</AvatarFallback>
									</Avatar>
									<span className="min-w-0 flex-1 text-sm text-muted-foreground [overflow-wrap:anywhere]">
										<span className="font-medium text-foreground">
											{event.actorName ?? "Someone"}
										</span>{" "}
										<ActivitySentence event={event} workspaceId={workspaceId} />
									</span>
									<time
										className="shrink-0 text-xs text-muted-foreground"
										dateTime={new Date(event.createdAt).toISOString()}
										title={fullTime(event.createdAt)}
									>
										{formatRelativeTime(event.createdAt)}
									</time>
								</li>
							))}
						</ol>
					</section>
				))
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
