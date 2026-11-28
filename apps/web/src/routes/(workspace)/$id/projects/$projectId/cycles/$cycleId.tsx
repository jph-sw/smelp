import { Edit02Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	notFound,
	useNavigate,
} from "@tanstack/react-router";
import { useState } from "react";
import { CycleBurnup } from "#/components/cycle/cycle-burnup";
import { CycleForm } from "#/components/cycle/cycle-form";
import {
	CycleProgress,
	CycleStatusBadge,
} from "#/components/cycle/cycle-parts";
import { openCreateIssueDialog } from "#/components/issue/create-issue-dialog-store";
import { ArchivedBanner } from "#/components/project/archived-banner";
import { IssueList } from "#/components/project/issue-list";
import { ProjectHeader } from "#/components/project/project-header";
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
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "#/components/ui/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { toast } from "#/components/ui/toast";
import { usePageTitle } from "#/hooks/use-page-title";
import {
	cycleBurnupQueryOptions,
	cycleQueryOptions,
	cyclesQueryOptions,
	deleteCycle,
	formatRange,
	invalidateCycles,
	moveUnfinishedToCycle,
	updateCycle,
} from "#/lib/data/cycle";
import { issuesQueryOptions } from "#/lib/data/issue";
import { labelsQueryOptions } from "#/lib/data/label";
import { moduleQueryKeys } from "#/lib/data/module";
import { projectQueryOptions } from "#/lib/data/project";
import {
	projectMembersQueryOptions,
	useProjectAccess,
} from "#/lib/data/project-members";
import { statesQueryOptions } from "#/lib/data/state";
import { toastError } from "#/lib/errors";

export const Route = createFileRoute(
	"/(workspace)/$id/projects/$projectId/cycles/$cycleId",
)({
	component: RouteComponent,
	loader: async ({
		context: { queryClient },
		params: { projectId, cycleId },
	}) => {
		// A cycle opened under another project's address isn't found.
		const cycle = await queryClient.ensureQueryData(
			cycleQueryOptions({ cycleId }),
		);
		if (cycle.projectId !== projectId) throw notFound();
		await Promise.all([
			queryClient.ensureQueryData(projectQueryOptions({ projectId })),
			queryClient.ensureQueryData(cyclesQueryOptions({ projectId })),
			queryClient.ensureQueryData(statesQueryOptions({ projectId })),
			queryClient.ensureQueryData(issuesQueryOptions({ projectId })),
			queryClient.ensureQueryData(labelsQueryOptions({ projectId })),
			queryClient.ensureQueryData(projectMembersQueryOptions({ projectId })),
			cycle.status !== "upcoming" &&
				queryClient.ensureQueryData(cycleBurnupQueryOptions({ cycleId })),
		]);
	},
});

function MoveUnfinished({
	cycleId,
	projectId,
	unfinishedCount,
}: {
	cycleId: string;
	projectId: string;
	unfinishedCount: number;
}) {
	const queryClient = useQueryClient();
	const { data: cycles } = useSuspenseQuery(cyclesQueryOptions({ projectId }));
	const { data: cycle } = useSuspenseQuery(cycleQueryOptions({ cycleId }));
	const others = cycles.filter((other) => other.id !== cycleId);
	// The next cycle by date is the usual target; the earlier ones follow.
	const next =
		others.find((other) => other.startDate > cycle.startDate) ?? others.at(-1);
	const [picked, setPicked] = useState<string | null>(null);
	const target = others.some((other) => other.id === picked)
		? (picked as string)
		: (next?.id ?? "");

	const { mutate: move, isPending } = useMutation({
		mutationFn: moveUnfinishedToCycle,
		onSuccess: async ({ moved }) => {
			const targetName = others.find((other) => other.id === target)?.name;
			toast({
				type: "success",
				description: `Moved ${moved} work ${moved === 1 ? "item" : "items"} to ${targetName}.`,
			});
			await Promise.all([
				invalidateCycles(queryClient, projectId),
				// Module progress follows the same items.
				...moduleQueryKeys(projectId).map((queryKey) =>
					queryClient.invalidateQueries({ queryKey }),
				),
				queryClient.invalidateQueries({ queryKey: ["issues", projectId] }),
				queryClient.invalidateQueries({ queryKey: ["issue"] }),
				queryClient.invalidateQueries({ queryKey: ["activity"] }),
			]);
		},
		onError: (error) => toastError(error, "Couldn't move the work items."),
	});

	const items = others.map((other) => ({ label: other.name, value: other.id }));
	if (others.length === 0) {
		return (
			<p className="text-xs text-muted-foreground">
				Create another cycle to move unfinished work items on.
			</p>
		);
	}

	return (
		<div className="flex flex-wrap items-center gap-2">
			<Select
				items={items}
				value={target}
				onValueChange={(value) => value && setPicked(value)}
			>
				<SelectTrigger aria-label="Move to cycle" className="max-w-56">
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
			<Button
				variant="outline"
				disabled={unfinishedCount === 0 || isPending}
				onClick={() => move({ fromCycleId: cycleId, toCycleId: target })}
			>
				Move {unfinishedCount} unfinished
			</Button>
		</div>
	);
}

function RouteComponent() {
	const { projectId, cycleId, id: workspaceId } = Route.useParams();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { data: cycle } = useSuspenseQuery(cycleQueryOptions({ cycleId }));
	usePageTitle(cycle.name);
	const { data: project } = useSuspenseQuery(
		projectQueryOptions({ projectId }),
	);
	const { data: states } = useSuspenseQuery(statesQueryOptions({ projectId }));
	const { data: issues } = useSuspenseQuery(issuesQueryOptions({ projectId }));
	const { data: labels } = useSuspenseQuery(labelsQueryOptions({ projectId }));
	const { members, canWrite, canManage, isArchived } =
		useProjectAccess(projectId);
	const [isEditOpen, setIsEditOpen] = useState(false);

	const items = issues.filter((issue) => issue.cycleId === cycleId);
	const unfinishedCount =
		cycle.progress.total - cycle.progress.completed - cycle.progress.cancelled;

	const { mutate: update, isPending: isUpdating } = useMutation({
		mutationFn: updateCycle,
		onSuccess: async () => {
			setIsEditOpen(false);
			await invalidateCycles(queryClient, projectId);
		},
		onError: (error) => toastError(error, "Couldn't save the cycle."),
	});

	const { mutateAsync: remove } = useMutation({
		mutationFn: deleteCycle,
		onSuccess: async () => {
			toast({ type: "success", description: `Deleted ${cycle.name}.` });
			// Leave first: while this page is open, refreshing the cycle would ask
			// for one that no longer exists.
			await navigate({
				to: "/$id/projects/$projectId/cycles",
				params: { id: workspaceId, projectId },
			});
			await Promise.all([
				invalidateCycles(queryClient, projectId),
				// Module progress follows the same items.
				...moduleQueryKeys(projectId).map((queryKey) =>
					queryClient.invalidateQueries({ queryKey }),
				),
				queryClient.invalidateQueries({ queryKey: ["issues", projectId] }),
				queryClient.invalidateQueries({ queryKey: ["issue"] }),
				queryClient.invalidateQueries({ queryKey: ["activity"] }),
			]);
		},
		onError: (error) => {
			toastError(error, "Couldn't delete the cycle.");
		},
	});

	return (
		<div className="flex h-full w-full min-h-0 flex-col overflow-hidden">
			<ProjectHeader
				workspaceId={workspaceId}
				projectId={projectId}
				section="cycles"
			/>
			{isArchived && <ArchivedBanner className="mx-4 mt-3" />}
			<div className="flex shrink-0 flex-col gap-4 border-b px-4 py-4">
				<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
					<Link
						to="/$id/projects/$projectId/cycles"
						params={{ id: workspaceId, projectId }}
						className="text-xs text-muted-foreground hover:underline"
					>
						All cycles
					</Link>
					<h1 className="min-w-0 truncate text-lg font-medium">{cycle.name}</h1>
					<CycleStatusBadge status={cycle.status} />
					<span className="text-xs text-muted-foreground">
						{formatRange(cycle)}
					</span>
					{canWrite && (
						<Button
							variant="outline"
							className="ms-auto"
							onClick={() =>
								openCreateIssueDialog({
									workspaceId,
									projectId,
									projectName: project.name,
									destination: {
										kind: "cycle",
										id: cycle.id,
										name: cycle.name,
									},
								})
							}
						>
							<HugeiconsIcon icon={PlusSignIcon} />
							New work item
						</Button>
					)}
					{canManage && !isArchived && (
						<div className="flex items-center gap-2">
							<Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
								<DialogTrigger render={<Button variant="outline" />}>
									<HugeiconsIcon icon={Edit02Icon} />
									Edit
								</DialogTrigger>
								<DialogContent>
									<DialogHeader>
										<DialogTitle>Edit cycle</DialogTitle>
									</DialogHeader>
									<CycleForm
										initial={{ ...cycle, goal: cycle.goal ?? "" }}
										submitLabel="Save"
										isPending={isUpdating}
										onSubmit={(values) => update({ id: cycle.id, ...values })}
									/>
								</DialogContent>
							</Dialog>
							<AlertDialog pendingAnnouncement="Deleting cycle">
								<AlertDialogTrigger render={<Button variant="destructive" />}>
									Delete
								</AlertDialogTrigger>
								<AlertDialogContent>
									<AlertDialogHeader>
										<AlertDialogTitle>Delete {cycle.name}?</AlertDialogTitle>
										<AlertDialogDescription>
											The cycle is removed. Its work items are kept, without a
											cycle. This action cannot be undone.
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel>Cancel</AlertDialogCancel>
										<AlertDialogAction
											variant="destructive"
											// onError already reports the failure.
											action={() => remove({ id: cycle.id }).catch(() => {})}
										>
											Delete cycle
										</AlertDialogAction>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
						</div>
					)}
				</div>
				{cycle.goal && (
					<p className="whitespace-pre-wrap text-sm text-muted-foreground">
						{cycle.goal}
					</p>
				)}
				<CycleProgress progress={cycle.progress} showLegend />
				{cycle.status !== "upcoming" && <CycleBurnup cycle={cycle} />}
				{canWrite && (
					<MoveUnfinished
						cycleId={cycleId}
						projectId={projectId}
						unfinishedCount={unfinishedCount}
					/>
				)}
			</div>
			{items.length === 0 ? (
				<p className="p-4 text-sm text-muted-foreground">
					No work items in this cycle yet. Add them from a work item's side
					panel.
				</p>
			) : (
				<IssueList
					issues={items}
					labels={labels}
					states={states}
					members={members}
					workspaceId={workspaceId}
				/>
			)}
		</div>
	);
}
