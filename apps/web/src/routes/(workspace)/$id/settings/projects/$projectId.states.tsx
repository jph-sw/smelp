import {
	ArrowDown01Icon,
	ArrowUp01Icon,
	Delete02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { tables } from "@smelp/db";
import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ArchivedBanner } from "#/components/project/archived-banner";
import {
	AlertDialog,
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { usePageTitle } from "#/hooks/use-page-title";
import { invalidateCycles } from "#/lib/data/cycle";
import {
	projectMembersQueryOptions,
	useProjectAccess,
} from "#/lib/data/project-members";
import {
	createState,
	deleteState,
	reorderStates,
	STATE_GROUP_ITEMS,
	type StateGroup,
	statesQueryOptions,
	updateState,
} from "#/lib/data/state";
import { toastError } from "#/lib/errors";

export const Route = createFileRoute(
	"/(workspace)/$id/settings/projects/$projectId/states",
)({
	component: RouteComponent,
	loader: ({ context: { queryClient }, params: { projectId } }) =>
		Promise.all([
			queryClient.ensureQueryData(statesQueryOptions({ projectId })),
			queryClient.ensureQueryData(projectMembersQueryOptions({ projectId })),
		]),
});

function GroupSelect({
	value,
	label,
	onChange,
}: {
	value: string;
	label: string;
	onChange: (group: StateGroup) => void;
}) {
	return (
		<Select
			items={STATE_GROUP_ITEMS}
			value={value}
			onValueChange={(next) => next && onChange(next as StateGroup)}
		>
			<SelectTrigger aria-label={label} className="w-32">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{STATE_GROUP_ITEMS.map((item) => (
					<SelectItem key={item.value} value={item.value}>
						{item.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

function DeleteStateButton({
	state,
	others,
	onDelete,
}: {
	state: tables["state"];
	others: tables["state"][];
	onDelete: (moveToStateId: string) => void;
}) {
	const [target, setTarget] = useState(others[0]?.id ?? "");
	const items = others.map((other) => ({
		label: other.name,
		value: other.id,
	}));

	if (state.isDefault) {
		return (
			<Button
				variant="ghost"
				size="icon"
				disabled
				aria-label={`${state.name} is the default state and can't be deleted`}
				title="Choose another default state first"
			>
				<HugeiconsIcon icon={Delete02Icon} />
			</Button>
		);
	}

	return (
		<AlertDialog>
			<AlertDialogTrigger
				aria-label={`Delete ${state.name}`}
				render={<Button variant="ghost" size="icon" />}
			>
				<HugeiconsIcon icon={Delete02Icon} />
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete "{state.name}"?</AlertDialogTitle>
					<AlertDialogDescription>
						Any work items in this state move to the state you choose.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<Select
					items={items}
					value={target}
					onValueChange={(next) => next && setTarget(next)}
				>
					<SelectTrigger aria-label="Move work items to" className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{items.map((item) => (
							<SelectItem key={item.value} value={item.value}>
								{item.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogCancel
						variant="destructive"
						onClick={() => onDelete(target)}
					>
						Delete state
					</AlertDialogCancel>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

function RouteComponent() {
	usePageTitle("Project states");
	const { projectId } = Route.useParams();
	const queryClient = useQueryClient();
	const statesOptions = statesQueryOptions({ projectId });
	const { data: states } = useSuspenseQuery(statesOptions);
	const { canManage, isArchived } = useProjectAccess(projectId);

	const [newName, setNewName] = useState("");
	const [newColor, setNewColor] = useState("#64748b");
	const [newGroup, setNewGroup] = useState<StateGroup>("started");

	const refresh = () =>
		Promise.all([
			queryClient.invalidateQueries({ queryKey: statesOptions.queryKey }),
			queryClient.invalidateQueries({ queryKey: ["issues", projectId] }),
			// A state's group decides how its items count in a cycle's progress.
			invalidateCycles(queryClient, projectId),
		]);
	const options = { onSettled: refresh, onError: (e: Error) => toastError(e) };

	const update = useMutation({ mutationFn: updateState, ...options });
	const remove = useMutation({ mutationFn: deleteState, ...options });
	const reorder = useMutation({ mutationFn: reorderStates, ...options });
	const create = useMutation({
		mutationFn: createState,
		...options,
		onSuccess: () => setNewName(""),
	});

	if (!canManage) {
		return (
			<p className="text-sm text-muted-foreground">
				Only project admins can change states.
			</p>
		);
	}

	if (isArchived) {
		return (
			<div className="flex flex-col gap-6">
				<h1 className="text-lg font-medium">States</h1>
				<ArchivedBanner />
				<ul className="flex flex-col gap-2">
					{states.map((state) => (
						<li key={state.id} className="flex items-center gap-2 text-sm">
							<span
								className="size-3 shrink-0 rounded-full ring-1 ring-foreground/20"
								style={{ backgroundColor: state.color }}
							/>
							{state.name}
						</li>
					))}
				</ul>
			</div>
		);
	}

	const move = (index: number, offset: number) => {
		const stateIds = states.map((state) => state.id);
		const [moved] = stateIds.splice(index, 1);
		if (moved === undefined) return;
		stateIds.splice(index + offset, 0, moved);
		reorder.mutate({ projectId, stateIds });
	};

	return (
		<div className="flex flex-col gap-6">
			<h1 className="text-lg font-medium">States</h1>
			<ul className="flex flex-col gap-2">
				{states.map((state, index) => (
					<li key={state.id} className="flex flex-wrap items-center gap-2">
						<div className="flex">
							<Button
								variant="ghost"
								size="icon"
								aria-label={`Move ${state.name} left on the board`}
								disabled={index === 0 || reorder.isPending}
								onClick={() => move(index, -1)}
							>
								<HugeiconsIcon icon={ArrowUp01Icon} />
							</Button>
							<Button
								variant="ghost"
								size="icon"
								aria-label={`Move ${state.name} right on the board`}
								disabled={index === states.length - 1 || reorder.isPending}
								onClick={() => move(index, 1)}
							>
								<HugeiconsIcon icon={ArrowDown01Icon} />
							</Button>
						</div>
						<input
							type="color"
							aria-label={`${state.name} color`}
							className="size-7 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
							defaultValue={state.color}
							onBlur={(event) => {
								if (event.target.value !== state.color) {
									update.mutate({ id: state.id, color: event.target.value });
								}
							}}
						/>
						<Input
							aria-label={`${state.name} name`}
							className="min-w-32 flex-1 sm:w-40 sm:flex-none"
							maxLength={32}
							defaultValue={state.name}
							key={state.name}
							onBlur={(event) => {
								const name = event.target.value.trim();
								if (!name) {
									event.target.value = state.name;
								} else if (name !== state.name) {
									update.mutate({ id: state.id, name });
								}
							}}
						/>
						<GroupSelect
							label={`${state.name} group`}
							value={state.group}
							onChange={(group) => update.mutate({ id: state.id, group })}
						/>
						{state.isDefault ? (
							<span className="w-24 text-center text-xs text-muted-foreground">
								Default
							</span>
						) : (
							<Button
								variant="ghost"
								className="w-24"
								onClick={() => update.mutate({ id: state.id, isDefault: true })}
							>
								Make default
							</Button>
						)}
						<DeleteStateButton
							state={state}
							others={states.filter((other) => other.id !== state.id)}
							onDelete={(moveToStateId) =>
								remove.mutate({ id: state.id, moveToStateId })
							}
						/>
					</li>
				))}
			</ul>
			<form
				className="flex flex-wrap items-center gap-2 border-t pt-4"
				onSubmit={(event) => {
					event.preventDefault();
					if (newName.trim()) {
						create.mutate({
							projectId,
							name: newName,
							color: newColor,
							group: newGroup,
						});
					}
				}}
			>
				<input
					type="color"
					aria-label="New state color"
					className="size-7 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
					value={newColor}
					onChange={(event) => setNewColor(event.target.value)}
				/>
				<Input
					aria-label="New state name"
					placeholder="New state name"
					className="min-w-32 flex-1 sm:w-40 sm:flex-none"
					maxLength={32}
					value={newName}
					onChange={(event) => setNewName(event.target.value)}
				/>
				<GroupSelect
					label="New state group"
					value={newGroup}
					onChange={setNewGroup}
				/>
				<Button type="submit" disabled={!newName.trim() || create.isPending}>
					Add state
				</Button>
			</form>
		</div>
	);
}
