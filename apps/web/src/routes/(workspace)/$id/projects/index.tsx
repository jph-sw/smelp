import { Setting07Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { DynamicIcon } from "#/components/dynamic-icon";
import { Button } from "#/components/ui/button";
import { Card } from "#/components/ui/card";
import { joinProject, projectsQueryOptions } from "#/lib/data/project";
import { useWorkspaceAccess } from "#/lib/data/workspace-members";
import { toastError } from "#/lib/errors";
import { cn, formatDate } from "#/lib/utils";

export const Route = createFileRoute("/(workspace)/$id/projects/")({
	component: RouteComponent,
	loader: ({ context: { queryClient }, params: { id } }) => {
		return queryClient.ensureQueryData(
			projectsQueryOptions({ workspaceId: id }),
		);
	},
});

function RouteComponent() {
	const { id: workspaceId } = Route.useParams();
	const queryClient = useQueryClient();
	const { canWrite } = useWorkspaceAccess(workspaceId);

	const { data: projects } = useSuspenseQuery(
		projectsQueryOptions({ workspaceId }),
	);
	const projectsQueryKey = projectsQueryOptions({ workspaceId }).queryKey;

	const { mutate: join, isPending: isJoining } = useMutation({
		mutationFn: joinProject,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: projectsQueryKey });
		},
		onError: (e) => toastError(e),
	});

	if (projects.length === 0) {
		return (
			<div className="p-4 text-sm text-muted-foreground sm:p-8">
				No projects yet. Create one from the sidebar.
			</div>
		);
	}

	return (
		<div className="p-4">
			<div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
				{projects.map((project) => (
					<Card
						key={project.id}
						className={cn(
							"relative gap-0 p-0 transition-shadow duration-150",
							project.isMember &&
								"hover:ring-1 hover:ring-foreground/20 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring",
						)}
					>
						<div className="relative flex h-20 shrink-0 items-center justify-center bg-muted">
							{project.image ? (
								<img
									alt=""
									className="absolute inset-0 size-full object-cover"
									src={project.image}
								/>
							) : (
								<DynamicIcon
									name={project.icon}
									className="size-6 text-muted-foreground"
								/>
							)}
						</div>
						<div className="flex flex-1 flex-col gap-1 p-4">
							{project.isMember ? (
								<Link
									to="/$id/projects/$projectId"
									params={{ id: workspaceId, projectId: project.id }}
									title={project.name}
									className="truncate text-sm font-semibold outline-none after:absolute after:inset-0"
								>
									{project.name}
								</Link>
							) : (
								<h3
									className="truncate text-sm font-semibold"
									title={project.name}
								>
									{project.name}
								</h3>
							)}
							<p
								className="line-clamp-2 text-card-foreground/80"
								title={project.description || undefined}
							>
								{project.description ||
									`Created ${formatDate(project.createdAt)}`}
							</p>
							<div className="mt-auto flex items-center justify-between pt-3">
								<span className="text-muted-foreground capitalize">
									{project.access}
								</span>
								{project.isMember ? (
									<Button
										variant={"secondary"}
										size={"icon-sm"}
										className="relative z-1"
										aria-label={`${project.name} settings`}
										render={
											<Link
												to="/$id/settings/projects/$projectId"
												params={{ id: workspaceId, projectId: project.id }}
											/>
										}
									>
										<HugeiconsIcon icon={Setting07Icon} />
									</Button>
								) : (
									canWrite && (
										<Button
											variant={"secondary"}
											size={"sm"}
											disabled={isJoining}
											onClick={() => join({ projectId: project.id })}
										>
											Join
										</Button>
									)
								)}
							</div>
						</div>
					</Card>
				))}
			</div>
		</div>
	);
}
