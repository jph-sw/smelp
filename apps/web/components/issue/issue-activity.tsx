import type { ProjectMember, tables } from "@smelp/db";
import {
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
	ACTIVITY_FILTERS,
	ACTIVITY_SORTS,
	arrangeTimeline,
	isActivityFilter,
	isActivitySort,
	useActivityView,
} from "#/lib/activity-view";
import { commentDraftStore } from "#/lib/comment-draft";
import {
	commentsQueryOptions,
	createComment,
	deleteComment,
	issueActivityQueryOptions,
	setReaction,
} from "#/lib/data/issue";
import { toastError } from "#/lib/errors";
import { RichTextEditor } from "../rich-text/rich-text-editor";
import { Button } from "../ui/button";
import { ViewSelect } from "./activity-view-select";
import { CommentItem, composerBox, Timestamp } from "./comment-item";
import { describeActivity } from "./describe-activity";

const EMPTY_MESSAGES = {
	all: "No comments yet.",
	comments: "No comments yet.",
	history: "No changes yet.",
} as const;

export function IssueActivity({
	issueId,
	userId,
	states,
	members,
	canManage,
	canWrite = false,
	readOnly = false,
	showHistory = true,
}: {
	issueId: string;
	userId: string | undefined;
	states: tables["state"][];
	members: ProjectMember[];
	canManage: boolean;
	/** A member or admin of a project that isn't archived, who can attach files. */
	canWrite?: boolean;
	/** Archived project: show the discussion, but no way to add to or remove from it. */
	readOnly?: boolean;
	/** The changes made to the item. Only members may read them. */
	showHistory?: boolean;
}) {
	const queryClient = useQueryClient();
	const commentsOptions = commentsQueryOptions({ issueId });
	const { data: comments } = useSuspenseQuery(commentsOptions);
	const { data: activity = [] } = useQuery({
		...issueActivityQueryOptions({ issueId }),
		enabled: showHistory,
	});
	const [draftStore] = useState(() => commentDraftStore(userId, issueId));
	const [draft, setDraft] = useState(draftStore.read);
	// A new editor after each post starts empty, with no undo history.
	const [composer, setComposer] = useState(0);
	const [view, setView] = useActivityView();

	useEffect(() => {
		window.addEventListener("pagehide", draftStore.flush);
		return () => {
			window.removeEventListener("pagehide", draftStore.flush);
			draftStore.flush();
		};
	}, [draftStore]);

	const refreshComments = () =>
		queryClient.invalidateQueries({ queryKey: commentsOptions.queryKey });

	const { mutate: addComment, isPending: isAdding } = useMutation({
		mutationFn: createComment,
		onSuccess: async () => {
			draftStore.clear();
			setDraft("");
			setComposer((n) => n + 1);
			await Promise.all([
				refreshComments(),
				queryClient.invalidateQueries({ queryKey: ["watchers", issueId] }),
			]);
		},
		onError: (e) => toastError(e),
	});

	const { mutate: removeComment, isPending: isRemoving } = useMutation({
		mutationFn: deleteComment,
		onSuccess: refreshComments,
		onError: (e) => toastError(e),
	});

	const myName =
		members.find((member) => member.userId === userId)?.displayName ?? "You";

	type CachedComments = typeof comments;
	const { mutate: react } = useMutation({
		mutationFn: setReaction,
		onMutate: async ({ commentId, emoji, reacted }) => {
			await queryClient.cancelQueries({ queryKey: commentsOptions.queryKey });
			const previous = queryClient.getQueryData<CachedComments>(
				commentsOptions.queryKey,
			);
			queryClient.setQueryData<CachedComments>(
				commentsOptions.queryKey,
				(current) =>
					current?.map((comment) => {
						if (comment.id !== commentId) return comment;
						const others = comment.reactions.filter(
							(reaction) => reaction.emoji !== emoji,
						);
						const own = comment.reactions.find(
							(reaction) => reaction.emoji === emoji,
						) ?? { emoji, count: 0, reacted: false, users: [] };
						if (own.reacted === reacted) return comment;
						const users = reacted
							? [...own.users, myName]
							: own.users.filter((name) => name !== myName);
						const updated = { emoji, count: users.length, reacted, users };
						// Keep the pill where it was; a new one goes last.
						const reactions = comment.reactions.some((r) => r.emoji === emoji)
							? comment.reactions.map((r) => (r.emoji === emoji ? updated : r))
							: [...others, updated];
						return {
							...comment,
							reactions: reactions.filter((reaction) => reaction.count > 0),
						};
					}),
			);
			return { previous };
		},
		onError: (e, _vars, context) => {
			if (context?.previous) {
				queryClient.setQueryData(commentsOptions.queryKey, context.previous);
			}
			toastError(e);
		},
		onSettled: refreshComments,
	});

	const submit = () => {
		if (draft.trim() && !isAdding) addComment({ issueId, body: draft });
	};

	// Without history only comments remain, whatever filter was saved.
	const filter = showHistory ? view.filter : "all";
	const timeline = arrangeTimeline(
		[
			...comments.map((comment) => ({ kind: "comment" as const, ...comment })),
			...activity.map((entry) => ({ kind: "activity" as const, ...entry })),
		],
		{ filter, sort: view.sort },
	);
	const showEmpty = timeline.length === 0 && (readOnly || filter !== "all");

	const composerForm = !readOnly && (
		<form
			className="space-y-2"
			onSubmit={(event) => {
				event.preventDefault();
				submit();
			}}
		>
			<RichTextEditor
				key={composer}
				value={draft}
				issueId={issueId}
				mentions={{ members, currentUserId: userId }}
				aria-label="Add a comment"
				placeholder="Add a comment. Type @ to mention someone, / for formatting."
				className={composerBox}
				onChange={(markdown) => {
					setDraft(markdown);
					draftStore.save(markdown);
				}}
				onSubmit={submit}
			/>
			<Button type="submit" disabled={!draft.trim() || isAdding}>
				Comment
			</Button>
		</form>
	);

	return (
		<section className="space-y-4" aria-label="Activity">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h2 className="text-sm font-semibold">Activity</h2>
				<div className="flex items-center gap-2">
					{showHistory && (
						<ViewSelect
							label="Show"
							value={filter}
							options={ACTIVITY_FILTERS}
							isOption={isActivityFilter}
							onChange={(next) => setView({ filter: next })}
						/>
					)}
					<ViewSelect
						label="Sort"
						value={view.sort}
						options={ACTIVITY_SORTS}
						isOption={isActivitySort}
						onChange={(sort) => setView({ sort })}
					/>
				</div>
			</div>
			{view.sort === "newest" && composerForm}
			{showEmpty && (
				<p className="text-sm text-muted-foreground">
					{EMPTY_MESSAGES[filter]}
				</p>
			)}
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
						<CommentItem
							key={entry.id}
							comment={entry}
							issueId={issueId}
							userId={userId}
							canWrite={canWrite}
							canManage={canManage}
							canEdit={!readOnly && entry.authorId === userId}
							canDelete={!readOnly && (entry.authorId === userId || canManage)}
							currentUserId={userId}
							members={members}
							canReact={!readOnly}
							onToggleReaction={(emoji, reacted) =>
								react({ commentId: entry.id, emoji, reacted })
							}
							isRemoving={isRemoving}
							onDelete={() => removeComment({ id: entry.id })}
							onEdited={refreshComments}
						/>
					),
				)}
			</ol>
			{view.sort === "oldest" && composerForm}
		</section>
	);
}
