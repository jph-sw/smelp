import {
	Delete02Icon,
	PencilEdit01Icon,
	PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { tables } from "@smelp/db";
import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { useState } from "react";
import {
	createLink,
	deleteLink,
	linksQueryOptions,
	updateLink,
} from "#/lib/data/issue";
import { toastError } from "#/lib/errors";
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
import { Button } from "../ui/button";
import { Input } from "../ui/input";

type Link = tables["issue_link"];

function LinkForm({
	initial,
	submitLabel,
	isPending,
	onSubmit,
	onCancel,
}: {
	initial?: Link;
	submitLabel: string;
	isPending: boolean;
	onSubmit: (value: { url: string; title: string }) => void;
	onCancel: () => void;
}) {
	const [url, setUrl] = useState(initial?.url ?? "");
	const [title, setTitle] = useState(initial?.title ?? "");

	return (
		<form
			className="space-y-2"
			onSubmit={(event) => {
				event.preventDefault();
				if (url.trim() && !isPending) onSubmit({ url, title });
			}}
		>
			<Input
				aria-label="Link URL"
				type="url"
				placeholder="https://example.com"
				maxLength={2000}
				autoFocus
				required
				value={url}
				onChange={(event) => setUrl(event.target.value)}
				onKeyDown={(event) => event.key === "Escape" && onCancel()}
			/>
			<Input
				aria-label="Link title"
				placeholder="Title (optional)"
				maxLength={200}
				value={title}
				onChange={(event) => setTitle(event.target.value)}
				onKeyDown={(event) => event.key === "Escape" && onCancel()}
			/>
			<div className="flex gap-2">
				<Button type="submit" size="sm" disabled={!url.trim() || isPending}>
					{submitLabel}
				</Button>
				<Button type="button" size="sm" variant="ghost" onClick={onCancel}>
					Cancel
				</Button>
			</div>
		</form>
	);
}

function RemoveLinkButton({
	isPending,
	onRemove,
}: {
	isPending: boolean;
	onRemove: () => void;
}) {
	return (
		<AlertDialog>
			<AlertDialogTrigger
				aria-label="Remove link"
				disabled={isPending}
				render={<Button variant="ghost" size="icon-sm" />}
			>
				<HugeiconsIcon icon={Delete02Icon} />
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Remove this link?</AlertDialogTitle>
					<AlertDialogDescription>
						This action cannot be undone.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogCancel
						variant="destructive"
						disabled={isPending}
						onClick={onRemove}
					>
						Remove link
					</AlertDialogCancel>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

export function IssueLinks({
	issueId,
	canWrite,
}: {
	issueId: string;
	canWrite: boolean;
}) {
	const queryClient = useQueryClient();
	const options = linksQueryOptions({ issueId });
	const { data: links } = useSuspenseQuery(options);
	// One form at a time: "new" adds a link, an id edits that one.
	const [form, setForm] = useState<"new" | string | null>(null);
	const adding = form === "new";

	const refresh = () =>
		Promise.all(
			[options.queryKey, ["activity", issueId]].map((queryKey) =>
				queryClient.invalidateQueries({ queryKey }),
			),
		);

	const { mutate: add, isPending: isAdding } = useMutation({
		mutationFn: createLink,
		onSuccess: async () => {
			setForm(null);
			await refresh();
		},
		onError: (e) => toastError(e, "Couldn't add the link."),
	});
	const { mutate: save, isPending: isSaving } = useMutation({
		mutationFn: updateLink,
		onSuccess: async () => {
			setForm(null);
			await refresh();
		},
		onError: (e) => toastError(e, "Couldn't save the link."),
	});
	const {
		mutate: remove,
		variables: removing,
		isPending: isRemoving,
	} = useMutation({
		mutationFn: deleteLink,
		onSuccess: refresh,
		onError: (e) => toastError(e, "Couldn't remove the link."),
	});

	if (links.length === 0 && !canWrite) return null;

	return (
		<section className="space-y-2" aria-label="Links">
			<div className="flex items-center justify-between">
				<h2 className="text-sm font-medium">Links</h2>
				{canWrite && form === null && (
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="Add a link"
						onClick={() => setForm("new")}
					>
						<HugeiconsIcon icon={PlusSignIcon} />
					</Button>
				)}
			</div>
			{adding && (
				<LinkForm
					submitLabel="Add link"
					isPending={isAdding}
					onSubmit={({ url, title }) => add({ issueId, url, title })}
					onCancel={() => setForm(null)}
				/>
			)}
			{links.length === 0 && !adding && (
				<p className="text-sm text-muted-foreground">No links.</p>
			)}
			<ul className="space-y-1">
				{links.map((link) =>
					form === link.id ? (
						<li key={link.id}>
							<LinkForm
								initial={link}
								submitLabel="Save"
								isPending={isSaving}
								onSubmit={({ url, title }) => save({ id: link.id, url, title })}
								onCancel={() => setForm(null)}
							/>
						</li>
					) : (
						<li key={link.id} className="flex items-center gap-1">
							<a
								href={link.url}
								target="_blank"
								rel="noopener noreferrer"
								title={link.url}
								className="min-w-0 flex-1 truncate text-sm underline-offset-3 hover:underline"
							>
								{link.title || link.url}
							</a>
							{canWrite && (
								<>
									<Button
										variant="ghost"
										size="icon-sm"
										aria-label="Edit link"
										onClick={() => setForm(link.id)}
									>
										<HugeiconsIcon icon={PencilEdit01Icon} />
									</Button>
									<RemoveLinkButton
										isPending={isRemoving && removing?.id === link.id}
										onRemove={() => remove({ id: link.id })}
									/>
								</>
							)}
						</li>
					),
				)}
			</ul>
		</section>
	);
}
