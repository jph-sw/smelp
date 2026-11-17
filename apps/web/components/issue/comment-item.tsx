import { Delete02Icon, PencilEdit01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ProjectMember, tables } from "@smelp/db";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { updateComment } from "#/lib/data/issue";
import { toastError } from "#/lib/errors";
import type { ReactionEmoji } from "#/lib/reactions";
import { formatDate, formatRelativeTime, initials } from "#/lib/utils";
import { RichTextEditor } from "../rich-text/rich-text-editor";
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
import { CommentAttachments } from "./attachments";
import {
	type CommentReaction,
	ReactionPicker,
	ReactionPills,
} from "./comment-reactions";

export const composerBox =
	"rounded-md border border-input bg-background px-3 py-2 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 [&_.rich-text]:min-h-16";

export function Timestamp({ time }: { time: number }) {
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

export function CommentItem({
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
		<li className="flex gap-3">
			<Avatar size="sm" className="mt-2">
				<AvatarImage src={comment.authorImage ?? undefined} alt="" />
				<AvatarFallback>{initials(comment.authorName)}</AvatarFallback>
			</Avatar>
			<div className="min-w-0 flex-1 rounded-lg border bg-card px-3 py-2">
				<div className="flex min-h-7 items-center justify-between gap-3">
					<span className="text-xs font-medium [overflow-wrap:anywhere]">
						{comment.authorName ?? "Former member"}
					</span>
					<div className="flex items-center gap-0.5">
						<Timestamp time={comment.createdAt} />
						{comment.editedAt !== null && (
							<span
								className="shrink-0 text-xs text-muted-foreground"
								title={`Edited ${formatDate(comment.editedAt)}`}
							>
								· edited
							</span>
						)}
						{canReact && !editing && (
							<ReactionPicker
								reactions={comment.reactions}
								onToggle={onToggleReaction}
							/>
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
						<RichTextEditor
							value={comment.body}
							issueId={issueId}
							mentions={{ members, currentUserId }}
							aria-label="Edit comment"
							autoFocus
							className={composerBox}
							onChange={setDraft}
							onSubmit={save}
							onCancel={cancel}
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
					<RichTextEditor
						value={comment.body}
						editable={false}
						mentions={{ members, currentUserId }}
						aria-label={`Comment by ${comment.authorName ?? "a former member"}`}
					/>
				)}
				<CommentAttachments
					issueId={issueId}
					commentId={comment.id}
					userId={userId}
					canWrite={canWrite}
					canManage={canManage}
					canAttach={editing && canWrite && comment.authorId === userId}
				/>
				{!editing && (
					<ReactionPills
						reactions={comment.reactions}
						canReact={canReact}
						onToggle={onToggleReaction}
					/>
				)}
			</div>
		</li>
	);
}
