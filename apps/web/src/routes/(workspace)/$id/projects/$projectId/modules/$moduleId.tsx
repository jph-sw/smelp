import { Layers02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ModuleDialog } from "#/components/module/module-dialog";
import {
	formatTargetDate,
	ModuleProgressBar,
} from "#/components/module/module-progress";
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
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "#/components/ui/breadcrumb";
import { Button } from "#/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { toast } from "#/components/ui/toast";
import { usePageTitle } from "#/hooks/use-page-title";
import { invalidateCycles } from "#/lib/data/cycle";
import { issuesQueryOptions, updateIssue } from "#/lib/data/issue";
import {
	deleteModule,
	moduleQueryKeys,
	moduleQueryOptions,
	modulesQueryOptions,
} from "#/lib/data/module";
import { projectQueryOptions } from "#/lib/data/project";
import {
	projectMembersQueryOptions,
	useProjectAccess,
} from "#/lib/data/project-members";
import { statesQueryOptions } from "#/lib/data/state";
import { toastError } from "#/lib/errors";

export const Route = createFileRoute(
	"/(workspace)/$id/projects/$projectId/modules/$moduleId",
)({
	component: RouteComponent,
	loader: async ({ context: { queryClient }, params: { moduleId } }) => {
		const found = await queryClient.ensureQueryData(
			moduleQueryOptions({ id: moduleId }),
		);
		const { projectId } = found;
		await Promise.all([
			queryClient.ensureQueryData(projectQueryOptions({ projectId })),
			queryClient.ensureQueryData(statesQueryOptions({ projectId })),
			queryClient.ensureQueryData(issuesQueryOptions({ projectId })),
			queryClient.ensureQueryData(projectMembersQueryOptions({ projectId })),
			queryClient.ensureQueryData(modulesQueryOptions({ projectId })),
		]);
	},
});

const PICK_ITEM = "pick";

function RouteComponent() {
	const { id: workspaceId, moduleId } = Route.useParams();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { data: found } = useSuspenseQuery(
		moduleQueryOptions({ id: moduleId }),
	);
	const projectId = found.projectId;
	usePageTitle(found.name);

	const { data: states } = useSuspenseQuery(statesQueryOptions({ projectId }));
	const { data: issues } = useSuspenseQuery(issuesQueryOptions({ projectId }));
	const { members, canWrite, canManage, isArchived } =
		useProjectAccess(projectId);
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);

	const items = issues.filter((issue) => issue.moduleId === found.id);
	const candidates = issues.filter((issue) => issue.moduleId !== found.id);

	const refresh = () =>
		Promise.all([
			...moduleQueryKeys(projectId).map((queryKey) =>
				queryClient.invalidateQueries({ queryKey }),
			),
			// Cycle progress follows the same items.
			invalidateCycles(queryClient, projectId),
			queryClient.invalidateQueries({ queryKey: ["issues", projectId] }),
			queryClient.invalidateQueries({ queryKey: ["issue"] }),
			queryClient.invalidateQueries({ queryKey: ["activity"] }),
		]);

	const { mutate: addItem, isPending: isAdding } = useMutation({
		mutationFn: (issueId: string) =>
			updateIssue({ id: issueId, moduleId: found.id }),
		onError: (e) => toastError(e, "Couldn't add the work item."),
		onSettled: refresh,
	});

	const { mutate: remove, isPending: isDeleting } = useMutation({
		mutationFn: deleteModule,
		onSuccess: async () => {
			toast({ type: "success", description: `Deleted ${found.name}.` });
			await navigate({
				to: "/$id/projects/$projectId/modules",
				params: { id: workspaceId, projectId },
			});
			queryClient.removeQueries({ queryKey: ["module", found.id] });
			await refresh();
		},
		onError: (e) => {
			toastError(e);
			setIsDeleteOpen(false);
		},
	});

	const pickItems = [
		{ label: "Add a work item…", value: PICK_ITEM },
		...candidates.map((issue) => ({
			label: `${issue.id} ${issue.title}`,
			value: issue.id,
		})),
	];

	return (
		<div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
			<ProjectHeader
				workspaceId={workspaceId}
				projectId={projectId}
				section="modules"
			/>
			<div className="flex h-10 w-full shrink-0 items-center border-b px-4 sm:px-5">
				<Breadcrumb>
					<BreadcrumbList>
						<BreadcrumbItem>
							<BreadcrumbLink
								render={
									<Link
										to="/$id/projects/$projectId/modules"
										params={{ id: workspaceId, projectId }}
										className="flex items-center gap-1"
									/>
								}
							>
								<HugeiconsIcon icon={Layers02Icon} className="size-4" />
								Modules
							</BreadcrumbLink>
						</BreadcrumbItem>
						<BreadcrumbSeparator />
						<BreadcrumbItem>
							<BreadcrumbPage className="max-w-48 truncate sm:max-w-none">
								{found.name}
							</BreadcrumbPage>
						</BreadcrumbItem>
					</BreadcrumbList>
				</Breadcrumb>
			</div>
			{isArchived && <ArchivedBanner className="mx-4 mt-3 sm:mx-5" />}
			<div className="min-h-0 flex-1 overflow-y-auto">
				<div className="flex flex-col gap-5 px-4 py-5 sm:px-9">
					<div className="flex flex-wrap items-start justify-between gap-3">
						<h1 className="min-w-0 text-xl font-semibold [overflow-wrap:anywhere]">
							{found.name}
						</h1>
						{canManage && !isArchived && (
							<div className="flex shrink-0 items-center gap-2">
								<ModuleDialog
									projectId={projectId}
									members={members}
									existing={found}
									trigger={<Button variant="outline">Edit</Button>}
								/>
								<AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
									<AlertDialogTrigger render={<Button variant="destructive" />}>
										Delete
									</AlertDialogTrigger>
									<AlertDialogContent>
										<AlertDialogHeader>
											<AlertDialogTitle>Delete {found.name}?</AlertDialogTitle>
											<AlertDialogDescription>
												The module is deleted. Its work items stay in the
												project, without a module. This action cannot be undone.
											</AlertDialogDescription>
										</AlertDialogHeader>
										<AlertDialogFooter>
											<AlertDialogCancel disabled={isDeleting}>
												Cancel
											</AlertDialogCancel>
											<AlertDialogAction
												variant="destructive"
												disabled={isDeleting}
												onClick={() => remove({ id: found.id })}
											>
												Delete module
											</AlertDialogAction>
										</AlertDialogFooter>
									</AlertDialogContent>
								</AlertDialog>
							</div>
						)}
					</div>
					{found.description && (
						<p className="max-w-prose text-sm/relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
							{found.description}
						</p>
					)}
					<dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
						<div className="flex gap-2">
							<dt className="text-muted-foreground">Lead</dt>
							<dd>{found.leadName ?? "No lead"}</dd>
						</div>
						<div className="flex gap-2">
							<dt className="text-muted-foreground">Target date</dt>
							<dd>
								{found.targetDate
									? formatTargetDate(found.targetDate)
									: "No target date"}
							</dd>
						</div>
					</dl>
					<ModuleProgressBar progress={found.progress} className="max-w-xl" />
				</div>
				<div className="flex items-center justify-between gap-2 border-t px-4 pt-4 sm:px-9">
					<h2 className="text-sm font-medium">Work items</h2>
					{canWrite && candidates.length > 0 && (
						<Select
							items={pickItems}
							value={PICK_ITEM}
							disabled={isAdding}
							onValueChange={(next) =>
								next != null && next !== PICK_ITEM && addItem(next)
							}
						>
							<SelectTrigger
								aria-label="Add a work item to this module"
								className="w-full max-w-64"
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{pickItems.map((item) => (
									<SelectItem key={item.value} value={item.value}>
										{item.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}
				</div>
				{items.length === 0 ? (
					<p className="px-4 py-3 text-sm text-muted-foreground sm:px-9">
						No work items in this module yet.
					</p>
				) : (
					<div className="flex flex-col sm:px-5">
						<IssueList
							issues={items}
							states={states}
							members={members}
							workspaceId={workspaceId}
						/>
					</div>
				)}
			</div>
		</div>
	);
}
