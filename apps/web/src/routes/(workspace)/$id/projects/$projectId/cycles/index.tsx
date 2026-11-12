import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { CycleForm } from "#/components/cycle/cycle-form";
import {
	CycleProgress,
	CycleStatusBadge,
} from "#/components/cycle/cycle-parts";
import { ArchivedBanner } from "#/components/project/archived-banner";
import { ProjectHeader } from "#/components/project/project-header";
import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "#/components/ui/dialog";
import { usePageTitle } from "#/hooks/use-page-title";
import { createCycle, cyclesQueryOptions, formatRange } from "#/lib/data/cycle";
import { projectQueryOptions } from "#/lib/data/project";
import {
	projectMembersQueryOptions,
	useProjectAccess,
} from "#/lib/data/project-members";
import { toastError } from "#/lib/errors";

export const Route = createFileRoute(
	"/(workspace)/$id/projects/$projectId/cycles/",
)({
	component: RouteComponent,
	loader: async ({ context: { queryClient }, params: { projectId } }) => {
		await Promise.all([
			queryClient.ensureQueryData(cyclesQueryOptions({ projectId })),
			queryClient.ensureQueryData(projectMembersQueryOptions({ projectId })),
		]);
	},
});

function RouteComponent() {
	const { projectId, id: workspaceId } = Route.useParams();
	const queryClient = useQueryClient();
	const { data: project } = useSuspenseQuery(
		projectQueryOptions({ projectId }),
	);
	usePageTitle(`${project.name} cycles`);
	const { data: cycles } = useSuspenseQuery(cyclesQueryOptions({ projectId }));
	// Creating cycles takes what project states take: a project admin.
	const { canManage, isArchived } = useProjectAccess(projectId);
	const [isCreateOpen, setIsCreateOpen] = useState(false);

	const { mutate: create, isPending } = useMutation({
		mutationFn: createCycle,
		onSuccess: async () => {
			setIsCreateOpen(false);
			await queryClient.invalidateQueries({ queryKey: ["cycles", projectId] });
		},
		onError: (error) => toastError(error, "Couldn't create the cycle."),
	});

	// What is running comes first, then what is ahead, then what is over.
	const groups = [
		{
			title: "Current",
			items: cycles.filter((cycle) => cycle.status === "current"),
		},
		{
			title: "Upcoming",
			items: cycles.filter((cycle) => cycle.status === "upcoming"),
		},
		{
			title: "Completed",
			items: cycles.filter((cycle) => cycle.status === "completed").reverse(),
		},
	].filter((group) => group.items.length > 0);

	return (
		<div className="flex h-full w-full min-h-0 flex-col overflow-hidden">
			<ProjectHeader
				workspaceId={workspaceId}
				projectId={projectId}
				section="cycles"
			/>
			{isArchived && <ArchivedBanner className="mx-4 mt-3" />}
			<div className="min-h-0 flex-1 overflow-y-auto p-4">
				<div className="mx-auto flex max-w-3xl flex-col gap-6">
					<div className="flex items-center justify-between gap-2">
						<h1 className="text-lg font-medium">Cycles</h1>
						{canManage && !isArchived && (
							<Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
								<DialogTrigger render={<Button />}>
									<HugeiconsIcon icon={PlusSignIcon} />
									New cycle
								</DialogTrigger>
								<DialogContent>
									<DialogHeader>
										<DialogTitle>New cycle</DialogTitle>
									</DialogHeader>
									<CycleForm
										submitLabel="Create cycle"
										isPending={isPending}
										onSubmit={(values) => create({ projectId, ...values })}
									/>
								</DialogContent>
							</Dialog>
						)}
					</div>
					{cycles.length === 0 && (
						<p className="text-sm text-muted-foreground">
							No cycles yet.
							{canManage && !isArchived
								? " Create one to plan a stretch of work."
								: ""}
						</p>
					)}
					{groups.map((group) => (
						<section key={group.title} className="flex flex-col gap-2">
							<h2 className="text-sm font-medium text-muted-foreground">
								{group.title}
							</h2>
							<ul className="flex flex-col gap-2">
								{group.items.map((cycle) => (
									<li key={cycle.id}>
										<Link
											to="/$id/projects/$projectId/cycles/$cycleId"
											params={{ id: workspaceId, projectId, cycleId: cycle.id }}
											className="flex flex-col gap-3 rounded-lg border p-3 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
										>
											<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
												<span className="min-w-0 truncate font-medium">
													{cycle.name}
												</span>
												<CycleStatusBadge status={cycle.status} />
												<span className="ms-auto text-xs text-muted-foreground">
													{formatRange(cycle)}
												</span>
											</div>
											<CycleProgress progress={cycle.progress} />
										</Link>
									</li>
								))}
							</ul>
						</section>
					))}
				</div>
			</div>
		</div>
	);
}
