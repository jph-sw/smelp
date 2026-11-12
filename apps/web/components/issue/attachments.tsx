import {
	Attachment01Icon,
	Cancel01Icon,
	Download01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { useRef } from "react";
import {
	AttachmentUploadError,
	attachmentLimitsQueryOptions,
	attachmentsQueryOptions,
	attachmentUrl,
	deleteAttachment,
	uploadAttachment,
} from "#/lib/data/issue";
import { toastError } from "#/lib/errors";
import { Button } from "../ui/button";
import { toast } from "../ui/toast";

export function formatBytes(bytes: number) {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function useAttachments(issueId: string) {
	const queryClient = useQueryClient();
	const options = attachmentsQueryOptions({ issueId });
	const { data } = useSuspenseQuery(options);
	const refresh = () => {
		queryClient.invalidateQueries({ queryKey: options.queryKey });
		// The upload and the removal both show in the work item's history.
		queryClient.invalidateQueries({ queryKey: ["activity", issueId] });
	};
	return { attachments: data, refresh };
}

type Attachment = ReturnType<typeof useAttachments>["attachments"][number];

function AttachButton({
	issueId,
	commentId,
	onUploaded,
}: {
	issueId: string;
	commentId?: string;
	onUploaded: () => void;
}) {
	const input = useRef<HTMLInputElement>(null);
	const { data: limits } = useQuery(attachmentLimitsQueryOptions);
	const { mutate, isPending } = useMutation({
		mutationFn: (files: File[]) =>
			// One at a time, so a refused file doesn't leave the rest in doubt.
			files.reduce(
				(previous, file) =>
					previous.then(() => uploadAttachment({ issueId, commentId, file })),
				Promise.resolve(),
			),
		onSettled: onUploaded,
		onError: (error) => {
			if (error instanceof AttachmentUploadError) {
				toast.add({ type: "error", description: error.message });
			} else {
				toastError(error);
			}
		},
	});

	return (
		<>
			<input
				ref={input}
				type="file"
				multiple
				hidden
				aria-label={commentId ? "Attach files to comment" : "Attach files"}
				onChange={(event) => {
					const files = Array.from(event.target.files ?? []);
					event.target.value = "";
					// Said here, in words, instead of after a long upload that is refused.
					const maxBytes = limits?.maxBytes ?? Number.POSITIVE_INFINITY;
					const allowed = files.filter((file) => file.size <= maxBytes);
					for (const file of files.filter((file) => file.size > maxBytes)) {
						toast.add({
							type: "error",
							description: `${file.name} is too large. The limit is ${formatBytes(maxBytes)}.`,
						});
					}
					if (allowed.length > 0) mutate(allowed);
				}}
			/>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				disabled={isPending}
				onClick={() => input.current?.click()}
			>
				<HugeiconsIcon icon={Attachment01Icon} />
				{isPending ? "Uploading…" : "Attach files"}
			</Button>
		</>
	);
}

function AttachmentList({
	attachments,
	canDelete,
	onDeleted,
}: {
	attachments: Attachment[];
	canDelete: (attachment: Attachment) => boolean;
	onDeleted: () => void;
}) {
	const { mutate: remove, isPending } = useMutation({
		mutationFn: deleteAttachment,
		onSuccess: onDeleted,
		onError: (error) => toastError(error),
	});

	if (attachments.length === 0) return null;
	return (
		<ul className="space-y-1">
			{attachments.map((attachment) => (
				<li
					key={attachment.id}
					className="flex items-center justify-between gap-2 rounded-md border bg-background px-2 py-1 text-sm"
				>
					<a
						href={attachmentUrl(attachment.id)}
						download={attachment.name}
						className="flex min-w-0 items-center gap-2 hover:underline"
					>
						<HugeiconsIcon
							icon={Download01Icon}
							className="size-4 shrink-0 text-muted-foreground"
						/>
						<span className="[overflow-wrap:anywhere]">{attachment.name}</span>
					</a>
					<span className="flex shrink-0 items-center gap-1">
						<span className="text-xs text-muted-foreground">
							{formatBytes(attachment.size)}
						</span>
						{canDelete(attachment) && (
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								aria-label={`Remove ${attachment.name}`}
								disabled={isPending}
								onClick={() => remove({ id: attachment.id })}
							>
								<HugeiconsIcon icon={Cancel01Icon} />
							</Button>
						)}
					</span>
				</li>
			))}
		</ul>
	);
}

type Access = {
	userId: string | undefined;
	/** Can add files: a member, in a project that isn't archived. */
	canWrite: boolean;
	/** Can remove other people's files. */
	canManage: boolean;
};

const mayDelete = (access: Access, attachment: Attachment) =>
	access.canWrite &&
	(attachment.uploaderId === access.userId || access.canManage);

// Files on the work item itself. Files on a comment are shown with the comment.
export function IssueAttachments({
	issueId,
	userId,
	canWrite,
	canManage,
}: { issueId: string } & Access) {
	const { attachments, refresh } = useAttachments(issueId);
	const own = attachments.filter((attachment) => attachment.commentId === null);
	if (own.length === 0 && !canWrite) return null;

	return (
		<section className="space-y-2" aria-label="Attachments">
			<div className="flex items-center justify-between gap-2">
				<h2 className="text-sm font-semibold">Attachments</h2>
				{canWrite && <AttachButton issueId={issueId} onUploaded={refresh} />}
			</div>
			<AttachmentList
				attachments={own}
				canDelete={(attachment) =>
					mayDelete({ userId, canWrite, canManage }, attachment)
				}
				onDeleted={refresh}
			/>
		</section>
	);
}

// The files on one comment, with a way to add more when it's the viewer's own.
export function CommentAttachments({
	issueId,
	commentId,
	canAttach,
	userId,
	canWrite,
	canManage,
}: {
	issueId: string;
	commentId: string;
	canAttach: boolean;
} & Access) {
	const { attachments, refresh } = useAttachments(issueId);
	const own = attachments.filter(
		(attachment) => attachment.commentId === commentId,
	);
	if (own.length === 0 && !canAttach) return null;

	return (
		<div className="mt-2 space-y-1">
			<AttachmentList
				attachments={own}
				canDelete={(attachment) =>
					mayDelete({ userId, canWrite, canManage }, attachment)
				}
				onDeleted={refresh}
			/>
			{canAttach && (
				<AttachButton
					issueId={issueId}
					commentId={commentId}
					onUploaded={refresh}
				/>
			)}
		</div>
	);
}
