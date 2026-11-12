import {
	Delete02Icon,
	PencilEdit01Icon,
	SmileIcon,
} from "@hugeicons/core-free-icons";
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
	setReaction,
	updateComment,
} from "#/lib/data/issue";
import { toastError } from "#/lib/errors";
import { REACTION_EMOJIS, type ReactionEmoji } from "#/lib/reactions";
import { RELATION_PHRASES } from "#/lib/relations";
import { cn, formatDate, formatRelativeTime, initials } from "#/lib/utils";
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
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Textarea } from "../ui/textarea";
import { CommentAttachments } from "./attachments";
import { CommentBody, MentionTextarea } from "./mentions";

const relatedLabel = (entry: { relatedId?: string | null }) =>
	entry.relatedId ?? "another work item";

type Activity = {
	relatedId?: string | null;
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
			if (entry.field === "parent") {
				return entry.newValue
					? `made this a sub-item of ${entry.newValue}`
					: "made this a top-level item";
			}
			if (entry.field === "module") {
				return entry.newValue
					? `added this to the module ${entry.newValue}`
					: `removed this from the module ${entry.oldValue ?? "a deleted module"}`;
			}
			if (entry.field === "cycle") {
				if (entry.newValue) return `added this to the cycle ${entry.newValue}`;
				return entry.oldValue
					? `removed this from the cycle ${entry.oldValue}`
					: "removed this from its cycle";
			}
			return entry.field === "title"
				? `renamed this to "${entry.newValue}"`
				: "edited the description";
		case "issue.attachment_added":
			return `attached ${entry.newValue ?? "a file"}`;
		case "issue.attachment_removed":
			return `removed ${entry.oldValue ?? "a file"}`;
		case "issue.relation_added":
			return `marked this as ${RELATION_PHRASES[entry.newValue ?? ""] ?? "related to"} ${relatedLabel(entry)}`;
		case "issue.relation_removed":
			return `removed the relation to ${relatedLabel(entry)}`;
		case "issue.link_added":
			return entry.newValue
				? `added the link "${entry.newValue}"`
				: "added a link";
		case "issue.link_updated": {
			const name = entry.newValue ?? entry.oldValue;
			return name ? `edited the link "${name}"` : "edited a link";
		}
		case "issue.link_removed":
			return entry.oldValue
				? `removed the link "${entry.oldValue}"`
				: "removed a link";
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

type CommentReaction = {
	emoji: string;
	count: number;
	reacted: boolean;
	users: string[];
};

function Reactions({
	reactions,
	canReact,
	onToggle,
}: {
	reactions: CommentReaction[];
	canReact: boolean;
	onToggle: (emoji: ReactionEmoji, reacted: boolean) => void;
}) {
	const [pickerOpen, setPickerOpen] = useState(false);
	if (reactions.length === 0 && !canReact) return null;

	return (
		<div className="mt-2 flex flex-wrap items-center gap-1">
			{reactions.map((reaction) => (
				<button
					key={reaction.emoji}
					type="button"
					// aria-disabled rather than disabled, so the "who reacted" title still shows.
					aria-disabled={!canReact}
					aria-pressed={reaction.reacted}
					aria-label={`${reaction.emoji} ${reaction.count}: ${reaction.users.join(", ")}`}
					title={reaction.users.join(", ")}
					onClick={
						canReact
							? () =>
									onToggle(reaction.emoji as ReactionEmoji, !reaction.reacted)
							: undefined
					}
					className={cn(
						"flex h-6 items-center gap-1 rounded-full border px-2 text-xs",
						reaction.reacted
							? "border-primary bg-primary/10 text-foreground"
							: "border-transparent bg-background text-muted-foreground",
						canReact && "cursor-pointer hover:border-foreground/30",
					)}
				>
					<span>{reaction.emoji}</span>
					<span className="tabular-nums">{reaction.count}</span>
				</button>
			))}
			{canReact && (
				<Popover open={pickerOpen} onOpenChange={setPickerOpen}>
					<PopoverTrigger
						aria-label="Add reaction"
						render={<Button variant="ghost" size="icon-sm" />}
					>
						<HugeiconsIcon icon={SmileIcon} />
					</PopoverTrigger>
					<PopoverContent align="start" className="w-auto flex-row gap-1 p-1.5">
						{REACTION_EMOJIS.map((emoji) => (
							<button
								key={emoji}
								type="button"
								aria-label={`React with ${emoji}`}
								className="cursor-pointer rounded-md p-1 text-base hover:bg-secondary"
								onClick={() => {
									setPickerOpen(false);
									const existing = reactions.find((r) => r.emoji === emoji);
									onToggle(emoji, !existing?.reacted);
								}}
							>
								{emoji}
							</button>
						))}
					</PopoverContent>
				</Popover>
			)}
		</div>
	);
}

function CommentItem({
	comment,
	issueId,
	userId,
	canWrite,
	canManage,
	canEdit,
	canDelete,
	currentUserId,
	members,
	canReact,
	isRemoving,
	onDelete,
	onEdited,
	onToggleReaction,
}: {
	issueId: string;
	userId: string | undefined;
	canWrite: boolean;
	canManage: boolean;
	comment: tables["comment"] & {
		authorName: string | null;
		authorImage: string | null;
		reactions: CommentReaction[];
	};
	canEdit: boolean;
	canDelete: boolean;
	currentUserId: string | undefined;
	members: ProjectMember[];
	canReact: boolean;
	onToggleReaction: (emoji: ReactionEmoji, reacted: boolean) => void;
	isRemoving: boolean;
	onDelete: () => void;
	onEdited: () => Promise<void>;
}) {
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(comment.body);

	const { mutate: saveComment, isPending: isSaving } = useMutation({
		mutationFn: updateComment,
		onSuccess: async () => {
			await onEdited();
			setEditing(false);
		},
		onError: (e) => toastError(e),
	});

	const startEditing = () => {
		setDraft(comment.body);
		setEditing(true);
	};
	const cancel = () => setEditing(false);
	const canSave =
		!isSaving && draft.trim() !== "" && draft.trim() !== comment.body;
	const save = () => {
		if (canSave) saveComment({ commentId: comment.id, body: draft });
	};

	return (
		<li className="flex gap-3 rounded-lg bg-secondary p-3">
			<Avatar size="sm">
				<AvatarImage src={comment.authorImage ?? undefined} alt="" />
				<AvatarFallback>{initials(comment.authorName)}</AvatarFallback>
			</Avatar>
			<div className="min-w-0 flex-1">
				<div className="flex items-baseline justify-between gap-3">
					<span className="text-xs font-medium [overflow-wrap:anywhere]">
						{comment.authorName ?? "Former member"}
					</span>
					<div className="flex items-center gap-1">
						<Timestamp time={comment.createdAt} />
						{comment.editedAt !== null && (
							<span
								className="shrink-0 text-xs text-muted-foreground"
								title={`Edited ${formatDate(comment.editedAt)}`}
							>
								· edited
							</span>
						)}
						{canEdit && !editing && (
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label="Edit comment"
								onClick={startEditing}
							>
								<HugeiconsIcon icon={PencilEdit01Icon} />
							</Button>
						)}
						{canDelete && !editing && (
							<DeleteCommentButton isPending={isRemoving} onDelete={onDelete} />
						)}
					</div>
				</div>
				{editing ? (
					<form
						className="mt-1 space-y-2"
						onSubmit={(event) => {
							event.preventDefault();
							save();
						}}
					>
						<Textarea
							aria-label="Edit comment"
							autoFocus
							value={draft}
							onChange={(event) => setDraft(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Escape") {
									event.preventDefault();
									cancel();
								} else if (
									event.key === "Enter" &&
									(event.metaKey || event.ctrlKey)
								) {
									event.preventDefault();
									save();
								}
							}}
						/>
						<div className="flex gap-2">
							<Button type="submit" size="sm" disabled={!canSave}>
								Save
							</Button>
							<Button type="button" size="sm" variant="ghost" onClick={cancel}>
								Cancel
							</Button>
						</div>
					</form>
				) : (
					<CommentBody
						body={comment.body}
						members={members}
						currentUserId={currentUserId}
					/>
				)}
				{!editing && (
					<>
						<CommentAttachments
							issueId={issueId}
							commentId={comment.id}
							userId={userId}
							canWrite={canWrite}
							canManage={canManage}
							canAttach={canWrite && comment.authorId === userId}
						/>
						<Reactions
							reactions={comment.reactions}
							canReact={canReact}
							onToggle={onToggleReaction}
						/>
					</>
				)}
			</div>
		</li>
	);
}

export function IssueActivity({
	issueId,
	userId,
	states,
	members,
	canManage,
	canWrite = false,
	readOnly = false,
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
			{!readOnly && (
				<form
					className="space-y-2"
					onSubmit={(event) => {
						event.preventDefault();
						submit();
					}}
				>
					<MentionTextarea
						aria-label="Add a comment"
						placeholder="Add a comment. Type @ to mention someone."
						value={draft}
						onValueChange={setDraft}
						members={members}
						onSubmit={submit}
					/>
					<Button type="submit" disabled={!draft.trim() || isAdding}>
						Comment
					</Button>
				</form>
			)}
		</section>
	);
}
