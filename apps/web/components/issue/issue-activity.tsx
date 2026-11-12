import { Delete02Icon, PencilEdit01Icon } from "@hugeicons/core-free-icons";
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
	updateComment,
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

const RELATION_PHRASES: Record<string, string> = {
	blocks: "blocking",
	blocked_by: "blocked by",
	relates: "related to",
	duplicates: "a duplicate of",
	duplicated_by: "duplicated by",
};

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
			return entry.field === "title"
				? `renamed this to "${entry.newValue}"`
				: "edited the description";
		case "issue.relation_added":
			return `marked this as ${RELATION_PHRASES[entry.newValue ?? ""] ?? "related to"} ${relatedLabel(entry)}`;
		case "issue.relation_removed":
			return `removed the relation to ${relatedLabel(entry)}`;
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

function CommentItem({
	comment,
	canEdit,
	canDelete,
	isRemoving,
	onDelete,
	onEdited,
}: {
	comment: tables["comment"] & {
		authorName: string | null;
		authorImage: string | null;
	};
	canEdit: boolean;
	canDelete: boolean;
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
					<p className="text-sm/relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
						{comment.body}
					</p>
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
						<CommentItem
							key={entry.id}
							comment={entry}
							canEdit={!readOnly && entry.authorId === userId}
							canDelete={!readOnly && (entry.authorId === userId || canManage)}
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
