import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CreateCycleDialog } from "#/components/cycle/create-cycle-dialog";
import {
	averageVelocity,
	CycleProgress,
	CycleStatusBadge,
	measuredCycles,
	VelocityChart,
} from "#/components/cycle/cycle-parts";
import { ArchivedBanner } from "#/components/project/archived-banner";
import { ProjectHeader } from "#/components/project/project-header";
import { usePageTitle } from "#/hooks/use-page-title";
import { cyclesQueryOptions, formatRange } from "#/lib/data/cycle";
import { projectQueryOptions } from "#/lib/data/project";
import {
	projectMembersQueryOptions,
	useProjectAccess,
} from "#/lib/data/project-members";
import { nextCycle } from "#/lib/next-cycle";
import { formatPoints, roundPoints } from "#/lib/points";

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
	const { data: project } = useSuspenseQuery(
		projectQueryOptions({ projectId }),
	);
	usePageTitle(`${project.name} cycles`);
	const { data: cycles } = useSuspenseQuery(cyclesQueryOptions({ projectId }));
	// Creating cycles takes what project states take: a project admin.
	const { canManage, isArchived } = useProjectAccess(projectId);
	const next = nextCycle(cycles);

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
	const measured = measuredCycles(cycles);
	const average = averageVelocity(measured);

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
							<div className="flex items-center gap-2">
								{next && (
									<CreateCycleDialog
										projectId={projectId}
										title="Next cycle"
										variant="outline"
										initial={next}
									>
										Next cycle
									</CreateCycleDialog>
								)}
								<CreateCycleDialog projectId={projectId} title="New cycle">
									<HugeiconsIcon icon={PlusSignIcon} />
									New cycle
								</CreateCycleDialog>
							</div>
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
					{measured.length > 0 && (
						<section className="flex flex-col gap-2">
							<h2 className="text-sm font-medium text-muted-foreground">
								Velocity
							</h2>
							<VelocityChart cycles={measured} />
						</section>
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
											{cycle.status === "current" && cycle.goal && (
												<p className="line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">
													{cycle.goal}
												</p>
											)}
											<CycleProgress progress={cycle.progress} />
											{cycle.status === "upcoming" && average && (
												<p className="text-xs text-muted-foreground">
													{formatPoints(cycle.progress.points.total)} planned ·
													velocity {roundPoints(average.points)}
												</p>
											)}
											{cycle.velocity &&
												cycle.velocity.committed.points > 0 && (
													<p className="text-xs text-muted-foreground">
														Completed{" "}
														{roundPoints(cycle.velocity.completed.points)} of{" "}
														{formatPoints(cycle.velocity.committed.points)}
													</p>
												)}
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
