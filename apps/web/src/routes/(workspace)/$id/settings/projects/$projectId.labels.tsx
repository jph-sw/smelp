import { Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { LabelDot } from "#/components/label/label-chips";
import { ArchivedBanner } from "#/components/project/archived-banner";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "#/components/ui/alert-dialog";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { usePageTitle } from "#/hooks/use-page-title";
import {
	createLabel,
	deleteLabel,
	invalidateLabels,
	type Label,
	labelsQueryOptions,
	updateLabel,
} from "#/lib/data/label";
import {
	projectMembersQueryOptions,
	useProjectAccess,
} from "#/lib/data/project-members";
import { toastError } from "#/lib/errors";

export const Route = createFileRoute(
	"/(workspace)/$id/settings/projects/$projectId/labels",
)({
	component: RouteComponent,
	loader: ({ context: { queryClient }, params: { projectId } }) =>
		Promise.all([
			queryClient.ensureQueryData(labelsQueryOptions({ projectId })),
			queryClient.ensureQueryData(projectMembersQueryOptions({ projectId })),
		]),
});

const COLOR_INPUT =
	"size-7 shrink-0 cursor-pointer rounded-md pointer-coarse:size-11 border border-input bg-transparent p-0.5";

function DeleteLabelButton({
	label,
	onDelete,
}: {
	label: Label;
	onDelete: () => Promise<unknown>;
}) {
	return (
		<AlertDialog pendingAnnouncement="Deleting label">
			<AlertDialogTrigger
				aria-label={`Delete ${label.name}`}
				render={<Button variant="ghost" size="icon" />}
			>
				<HugeiconsIcon icon={Delete02Icon} />
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete "{label.name}"?</AlertDialogTitle>
					<AlertDialogDescription>
						The label comes off every work item that has it. This can't be
						undone.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						variant="destructive"
						// onError already reports the failure.
						action={() => onDelete().catch(() => {})}
					>
						Delete label
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

function LabelList({ labels }: { labels: Label[] }) {
	return (
		<ul className="flex flex-col gap-2">
			{labels.map((label) => (
				<li key={label.id} className="flex items-center gap-2 text-sm">
					<LabelDot color={label.color} className="size-3" />
					{label.name}
				</li>
			))}
		</ul>
	);
}

function RouteComponent() {
	usePageTitle("Project labels");
	const { projectId } = Route.useParams();
	const queryClient = useQueryClient();
	const { data: labels } = useSuspenseQuery(labelsQueryOptions({ projectId }));
	const { canManage, isArchived } = useProjectAccess(projectId);

	const [newName, setNewName] = useState("");
	const [newColor, setNewColor] = useState("#3b82f6");

	const options = {
		onSettled: () => invalidateLabels(queryClient, projectId),
		onError: (e: Error) => toastError(e),
	};
	const update = useMutation({ mutationFn: updateLabel, ...options });
	const remove = useMutation({ mutationFn: deleteLabel, ...options });
	const create = useMutation({
		mutationFn: createLabel,
		...options,
		onSuccess: () => setNewName(""),
	});

	if (!canManage) {
		return (
			<p className="text-sm text-muted-foreground">
				Only project admins can change labels.
			</p>
		);
	}

	if (isArchived) {
		return (
			<div className="flex flex-col gap-6">
				<h1 className="text-lg font-medium">Labels</h1>
				<ArchivedBanner />
				<LabelList labels={labels} />
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-1">
				<h1 className="text-lg font-medium">Labels</h1>
				<p className="text-sm text-muted-foreground">
					Tag work items across types, modules and cycles, and filter the board
					by them.
				</p>
			</div>
			{labels.length === 0 ? (
				<p className="text-sm text-muted-foreground">No labels yet.</p>
			) : (
				<ul className="flex flex-col gap-2">
					{labels.map((label) => (
						<li key={label.id} className="flex items-center gap-2">
							<input
								type="color"
								aria-label={`${label.name} color`}
								className={COLOR_INPUT}
								defaultValue={label.color}
								onBlur={(event) => {
									if (event.target.value !== label.color) {
										update.mutate({ id: label.id, color: event.target.value });
									}
								}}
							/>
							<Input
								aria-label={`${label.name} name`}
								className="min-w-32 flex-1 sm:w-56 sm:flex-none"
								maxLength={32}
								defaultValue={label.name}
								key={label.name}
								onBlur={(event) => {
									const input = event.target;
									const name = input.value.trim();
									if (!name) {
										input.value = label.name;
									} else if (name !== label.name) {
										update.mutate(
											{ id: label.id, name },
											{
												onError: () => {
													input.value = label.name;
												},
											},
										);
									}
								}}
							/>
							<DeleteLabelButton
								label={label}
								onDelete={() => remove.mutateAsync({ id: label.id })}
							/>
						</li>
					))}
				</ul>
			)}
			<form
				className="flex flex-wrap items-center gap-2 border-t pt-4"
				onSubmit={(event) => {
					event.preventDefault();
					if (newName.trim()) {
						create.mutate({ projectId, name: newName, color: newColor });
					}
				}}
			>
				<input
					type="color"
					aria-label="New label color"
					className={COLOR_INPUT}
					value={newColor}
					onChange={(event) => setNewColor(event.target.value)}
				/>
				<Input
					aria-label="New label name"
					placeholder="New label name"
					className="min-w-32 flex-1 sm:w-56 sm:flex-none"
					maxLength={32}
					value={newName}
					onChange={(event) => setNewName(event.target.value)}
				/>
				<Button type="submit" disabled={!newName.trim() || create.isPending}>
					Add label
				</Button>
			</form>
		</div>
	);
}
