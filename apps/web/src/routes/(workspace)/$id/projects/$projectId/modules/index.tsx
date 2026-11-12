import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ModuleDialog } from "#/components/module/module-dialog";
import {
	formatTargetDate,
	ModuleProgressBar,
} from "#/components/module/module-progress";
import { ArchivedBanner } from "#/components/project/archived-banner";
import { ProjectHeader } from "#/components/project/project-header";
import { Button } from "#/components/ui/button";
import { usePageTitle } from "#/hooks/use-page-title";
import { modulesQueryOptions } from "#/lib/data/module";
import { projectQueryOptions } from "#/lib/data/project";
import {
	projectMembersQueryOptions,
	useProjectAccess,
} from "#/lib/data/project-members";

export const Route = createFileRoute(
	"/(workspace)/$id/projects/$projectId/modules/",
)({
	component: RouteComponent,
	loader: async ({ context: { queryClient }, params: { projectId } }) => {
		await Promise.all([
			queryClient.ensureQueryData(projectQueryOptions({ projectId })),
			queryClient.ensureQueryData(modulesQueryOptions({ projectId })),
			queryClient.ensureQueryData(projectMembersQueryOptions({ projectId })),
		]);
	},
});

function RouteComponent() {
	const { id: workspaceId, projectId } = Route.useParams();
	const navigate = useNavigate();
	const { data: project } = useSuspenseQuery(
		projectQueryOptions({ projectId }),
	);
	usePageTitle(`Modules · ${project.name}`);
	const { data: modules } = useSuspenseQuery(
		modulesQueryOptions({ projectId }),
	);
	const { members, isArchived, canManage } = useProjectAccess(projectId);

	return (
		<div className="flex h-full w-full min-h-0 flex-col overflow-hidden">
			<ProjectHeader
				workspaceId={workspaceId}
				projectId={projectId}
				section="modules"
			/>
			{isArchived && <ArchivedBanner className="mx-4 mt-3" />}
			<div className="min-h-0 flex-1 overflow-y-auto p-4">
				<div className="mx-auto flex max-w-3xl flex-col gap-4">
					<div className="flex items-center justify-between gap-2">
						<h1 className="text-lg font-medium">Modules</h1>
						{canManage && !isArchived && (
							<ModuleDialog
								projectId={projectId}
								members={members}
								trigger={
									<Button>
										<HugeiconsIcon icon={PlusSignIcon} />
										New module
									</Button>
								}
								onSaved={(moduleId) =>
									navigate({
										to: "/$id/projects/$projectId/modules/$moduleId",
										params: { id: workspaceId, projectId, moduleId },
									})
								}
							/>
						)}
					</div>
					{modules.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							No modules yet.{" "}
							{canManage && !isArchived
								? "Create one to group the work items of a feature or epic."
								: "A project admin can create one to group the work items of a feature or epic."}
						</p>
					) : (
						<ul className="flex flex-col gap-3">
							{modules.map((module) => (
								<li key={module.id}>
									<Link
										to="/$id/projects/$projectId/modules/$moduleId"
										params={{ id: workspaceId, projectId, moduleId: module.id }}
										className="flex flex-col gap-3 rounded-lg border p-4 outline-none transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
									>
										<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
											<span className="min-w-0 font-medium [overflow-wrap:anywhere]">
												{module.name}
											</span>
											<span className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
												{module.leadName && (
													<span>Lead: {module.leadName}</span>
												)}
												{module.targetDate && (
													<span>
														Target: {formatTargetDate(module.targetDate)}
													</span>
												)}
												<span>
													{module.progress.total}{" "}
													{module.progress.total === 1 ? "item" : "items"}
												</span>
											</span>
										</div>
										<ModuleProgressBar progress={module.progress} />
									</Link>
								</li>
							))}
						</ul>
					)}
				</div>
			</div>
		</div>
	);
}
