import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { DynamicIcon } from "#/components/dynamic-icon";
import { usePageTitle } from "#/hooks/use-page-title";
import { myIssuesQueryOptions } from "#/lib/data/issue";
import { projectsQueryOptions } from "#/lib/data/project";
import { workspaceQueryOptions } from "#/lib/data/workspace";

export const Route = createFileRoute("/(workspace)/$id/")({
	component: RouteComponent,
	loader: ({ context: { queryClient }, params: { id } }) =>
		queryClient.ensureQueryData(myIssuesQueryOptions({ workspaceId: id })),
});

function RouteComponent() {
	const { id: workspaceId } = Route.useParams();
	const { data: workspace } = useSuspenseQuery(
		workspaceQueryOptions({ workspaceId }),
	);
	usePageTitle(workspace.name);
	const { data: projects } = useSuspenseQuery(
		projectsQueryOptions({ workspaceId }),
	);
	const { data: myIssues } = useSuspenseQuery(
		myIssuesQueryOptions({ workspaceId }),
	);
	const myProjects = projects.filter((project) => project.isMember);

	return (
		<div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-8">
			<h1 className="text-xl font-medium [overflow-wrap:anywhere]">
				{workspace.name}
			</h1>
			<section className="space-y-1" aria-label="My work">
				<h2 className="text-xs font-medium text-muted-foreground">My work</h2>
				{myIssues.length === 0 ? (
					<p className="p-2 text-sm text-muted-foreground">
						Nothing open is assigned to you.
					</p>
				) : (
					myIssues.map((issue) => (
						<Link
							key={issue.id}
							to="/$id/browse/$issueId"
							params={{ id: workspaceId, issueId: issue.id }}
							className="flex items-center gap-3 rounded-md p-2 transition-colors duration-150 hover:bg-muted"
						>
							<span
								className="size-3 shrink-0 rounded-full ring-1 ring-foreground/20"
								style={{ backgroundColor: issue.stateColor }}
								title={issue.stateName}
							/>
							<span className="min-w-0 flex-1">
								<span className="block truncate text-sm font-medium">
									{issue.title}
								</span>
								<span className="block truncate text-xs text-muted-foreground">
									{issue.id} in {issue.projectName}, {issue.stateName}
								</span>
							</span>
						</Link>
					))
				)}
			</section>
			{myProjects.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					You aren't in any projects yet. Create one from the sidebar, or{" "}
					<Link
						to="/$id/projects"
						params={{ id: workspaceId }}
						className="underline underline-offset-3"
					>
						browse this workspace's projects
					</Link>
					.
				</p>
			) : (
				<div className="space-y-1">
					<h2 className="text-xs font-medium text-muted-foreground">
						Your projects
					</h2>
					{myProjects.map((project) => (
						<Link
							key={project.id}
							to="/$id/projects/$projectId"
							params={{ id: workspaceId, projectId: project.id }}
							className="flex items-center gap-3 rounded-md p-2 transition-colors duration-150 hover:bg-muted"
						>
							<span className="flex shrink-0 rounded-sm bg-secondary p-1.5">
								<DynamicIcon name={project.icon} className="size-4" />
							</span>
							<span className="min-w-0">
								<span className="block truncate text-sm font-medium">
									{project.name}
								</span>
								{project.description && (
									<span className="block truncate text-xs text-muted-foreground">
										{project.description}
									</span>
								)}
							</span>
						</Link>
					))}
				</div>
			)}
		</div>
	);
}
