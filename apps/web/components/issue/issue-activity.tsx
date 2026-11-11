import { Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ProjectMember, tables } from "@smelp/db";
import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { useState } from "react";
import {
	commentsQueryOptions,
	createComment,
	deleteComment,
	issueActivityQueryOptions,
} from "#/lib/data/issue";
import { toastError } from "#/lib/errors";
import { formatDate, formatRelativeTime, initials } from "#/lib/utils";
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "../ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";

type Activity = {
	action: string;
	field: string | null;
	oldValue: string | null;
	newValue: string | null;
};

function describeActivity(
	entry: Activity,
	states: tables["state"][],
	members: ProjectMember[],
) {
	const stateName = (id: string | null) =>
		states.find((state) => state.id === id)?.name ?? "a deleted state";
	const memberName = (id: string | null) =>
		members.find((member) => member.userId === id)?.displayName ??
		"a former member";

	switch (entry.action) {
		case "created":
			return "created this work item";
		case "status_changed":
			return `moved this from ${stateName(entry.oldValue)} to ${stateName(entry.newValue)}`;
		case "assigned":
			return entry.newValue
				? `assigned this to ${memberName(entry.newValue)}`
				: `unassigned ${memberName(entry.oldValue)}`;
		case "issue.updated":
			return entry.field === "title"
				? `renamed this to "${entry.newValue}"`
				: "edited the description";
		default:
			return "changed this work item";
	}
}

function Timestamp({ time }: { time: number }) {
	return (
		<time
			className="shrink-0 text-xs text-muted-foreground"
			title={formatDate(time)}
		>
			{formatRelativeTime(time)}
		</time>
	);
}

function DeleteCommentButton({
	onDelete,
	isPending,
}: {
	onDelete: () => void;
	isPending: boolean;
}) {
	return (
		<AlertDialog>
			<AlertDialogTrigger
				aria-label="Delete comment"
				render={<Button variant="ghost" size="icon-sm" />}
			>
				<HugeiconsIcon icon={Delete02Icon} />
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete this comment?</AlertDialogTitle>
					<AlertDialogDescription>
						This action cannot be undone.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogCancel
						variant="destructive"
						disabled={isPending}
						onClick={onDelete}
					>
						Delete comment
					</AlertDialogCancel>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

export function IssueActivity({
	issueId,
	userId,
	states,
	members,
	canManage,
	readOnly = false,
}: {
	issueId: string;
	userId: string | undefined;
	states: tables["state"][];
	members: ProjectMember[];
	canManage: boolean;
	/** Archived project: show the discussion, but no way to add to or remove from it. */
	readOnly?: boolean;
}) {
	const queryClient = useQueryClient();
	const commentsOptions = commentsQueryOptions({ issueId });
	const { data: comments } = useSuspenseQuery(commentsOptions);
	const { data: activity } = useSuspenseQuery(
		issueActivityQueryOptions({ issueId }),
	);
	const [draft, setDraft] = useState("");

	const refreshComments = () =>
		queryClient.invalidateQueries({ queryKey: commentsOptions.queryKey });

	const { mutate: addComment, isPending: isAdding } = useMutation({
		mutationFn: createComment,
		onSuccess: async () => {
			setDraft("");
			await refreshComments();
		},
		onError: (e) => toastError(e),
	});

	const { mutate: removeComment, isPending: isRemoving } = useMutation({
		mutationFn: deleteComment,
		onSuccess: refreshComments,
		onError: (e) => toastError(e),
	});

	const submit = () => {
		if (draft.trim() && !isAdding) addComment({ issueId, body: draft });
	};

	const timeline = [
		...comments.map((comment) => ({ kind: "comment" as const, ...comment })),
		...activity.map((entry) => ({ kind: "activity" as const, ...entry })),
	].sort((a, b) => a.createdAt - b.createdAt);

	return (
		<section className="space-y-4" aria-label="Activity">
			<h2 className="text-lg font-semibold">Activity</h2>
			<ol className="space-y-3">
				{timeline.map((entry) =>
					entry.kind === "activity" ? (
						<li
							key={entry.id}
							className="flex items-baseline justify-between gap-3 text-xs"
						>
							<span className="text-muted-foreground [overflow-wrap:anywhere]">
								<span className="font-medium text-foreground">
									{entry.actorName ?? "Someone"}
								</span>{" "}
								{describeActivity(entry, states, members)}
							</span>
							<Timestamp time={entry.createdAt} />
						</li>
					) : (
						<li
							key={entry.id}
							className="flex gap-3 rounded-lg bg-secondary p-3"
						>
							<Avatar size="sm">
								<AvatarImage src={entry.authorImage ?? undefined} alt="" />
								<AvatarFallback>{initials(entry.authorName)}</AvatarFallback>
							</Avatar>
							<div className="min-w-0 flex-1">
								<div className="flex items-baseline justify-between gap-3">
									<span className="text-xs font-medium [overflow-wrap:anywhere]">
										{entry.authorName ?? "Former member"}
									</span>
									<div className="flex items-center gap-1">
										<Timestamp time={entry.createdAt} />
										{!readOnly && (entry.authorId === userId || canManage) && (
											<DeleteCommentButton
												isPending={isRemoving}
												onDelete={() => removeComment({ id: entry.id })}
											/>
										)}
									</div>
								</div>
								<p className="text-sm/relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
									{entry.body}
								</p>
							</div>
						</li>
					),
				)}
			</ol>
			{!readOnly && (
				<form
					className="space-y-2"
					onSubmit={(event) => {
						event.preventDefault();
						submit();
					}}
				>
					<Textarea
						aria-label="Add a comment"
						placeholder="Add a comment"
						value={draft}
						onChange={(event) => setDraft(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
								event.preventDefault();
								submit();
							}
						}}
					/>
					<Button type="submit" disabled={!draft.trim() || isAdding}>
						Comment
					</Button>
				</form>
			)}
		</section>
	);
}
