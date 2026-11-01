import { HistoryIcon, Layers02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ProjectHeader } from "#/components/project/project-header";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "#/components/ui/breadcrumb";
import { issueQueryOptions } from "#/lib/data/issue";
import { formatDate, formatRelativeTime } from "#/lib/utils";

export const Route = createFileRoute("/(workspace)/$id/browse/$issueId")({
	component: RouteComponent,
	loader: async ({ context: { queryClient, user }, params: { issueId } }) => {
		if (user == null) throw redirect({ to: "/signin" });

		await Promise.all([
			queryClient.ensureQueryData(issueQueryOptions({ issueId })),
		]);
	},
});

function RouteComponent() {
	const { id: workspaceId, issueId } = Route.useParams();

	const { data: issue } = useSuspenseQuery(issueQueryOptions({ issueId }));

	return (
		<div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
			<ProjectHeader workspaceId={workspaceId} projectId={issue.projectId} />

			<div className="flex h-10 w-full shrink-0 items-center border-b px-4 sm:px-5">
				<Breadcrumb>
					<BreadcrumbList>
						<BreadcrumbItem>
							<BreadcrumbLink
								render={
									<Link
										to="/$id/projects/$projectId"
										params={{ id: workspaceId, projectId: issue.projectId }}
										className="flex items-center gap-1"
									/>
								}
							>
								<HugeiconsIcon icon={Layers02Icon} className="size-4" />
								Work Items
							</BreadcrumbLink>
						</BreadcrumbItem>
						<BreadcrumbSeparator />
						<BreadcrumbItem>
							<BreadcrumbPage>{issue.id}</BreadcrumbPage>
						</BreadcrumbItem>
					</BreadcrumbList>
				</Breadcrumb>
			</div>
			<div className="flex min-h-0 flex-1">
				<div className="min-w-0 flex-1 space-y-6 overflow-y-auto px-4 py-5 sm:px-9">
					<div className="space-y-4">
						<div className="text-sm font-medium text-foreground/60">
							{issue.id}
						</div>
						<h1 className="text-xl font-semibold [overflow-wrap:anywhere]">
							{issue.title}
						</h1>
						{issue.description ? (
							<p className="max-w-prose text-sm/relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
								{issue.description}
							</p>
						) : (
							<p className="text-sm text-muted-foreground">No description.</p>
						)}
						<span
							className="flex items-center gap-1 text-xs text-muted-foreground"
							title={formatDate(issue.updatedAt)}
						>
							<HugeiconsIcon icon={HistoryIcon} className="size-3.5" />
							Updated {formatRelativeTime(issue.updatedAt)}
						</span>
					</div>
				</div>
				<aside className="hidden w-80 shrink-0 border-l lg:block xl:w-96" />
			</div>
		</div>
	);
}
