import { ChevronDownIcon, Setting07Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { tables } from "@smelp/db";
import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { DynamicIcon } from "#/components/dynamic-icon";
import { Button } from "#/components/ui/button";
import { Card } from "#/components/ui/card";
import { usePageTitle } from "#/hooks/use-page-title";
import { joinProject, projectsQueryOptions } from "#/lib/data/project";
import { toastError } from "#/lib/errors";
import { cn, formatDate } from "#/lib/utils";
import { useWorkspaceAccess } from "#/lib/workspace-viewer";

export const Route = createFileRoute("/(workspace)/$id/projects/")({
	component: RouteComponent,
	loader: ({ context: { queryClient }, params: { id } }) => {
		return queryClient.ensureQueryData(
			projectsQueryOptions({ workspaceId: id }),
		);
	},
});

function RouteComponent() {
	usePageTitle("Projects");
	const { id: workspaceId } = Route.useParams();
	const queryClient = useQueryClient();
	const { viewer, canWrite } = useWorkspaceAccess();
	const isPublic = viewer.mode === "public";
	const [showArchived, setShowArchived] = useState(false);

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

	const active = projects.filter((project) => !project.isArchived);
	const archived = projects.filter((project) => project.isArchived);

	if (projects.length === 0) {
		return (
			<div className="p-4 text-sm text-muted-foreground sm:p-8">
				{isPublic
					? "Nothing here is public yet."
					: "No projects yet. Create one from the sidebar."}
			</div>
		);
	}

	const renderCards = (list: Project[]) => (
		<div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
			{list.map((project) => (
				<ProjectCard
					key={project.id}
					project={project}
					workspaceId={workspaceId}
					canOpen={isPublic || project.isMember}
					canJoin={canWrite}
					isJoining={isJoining}
					onJoin={() => join({ projectId: project.id })}
				/>
			))}
		</div>
	);

	return (
		<div className="space-y-6 p-4">
			{active.length > 0 ? (
				renderCards(active)
			) : (
				<p className="text-sm text-muted-foreground">
					Every project here is archived.
				</p>
			)}
			{archived.length > 0 && (
				<section aria-label="Archived projects" className="space-y-3">
					<Button
						variant={"ghost"}
						size={"sm"}
						aria-expanded={showArchived}
						onClick={() => setShowArchived(!showArchived)}
					>
						<HugeiconsIcon
							icon={ChevronDownIcon}
							className={cn(
								"transition-transform duration-150",
								!showArchived && "-rotate-90",
							)}
						/>
						Archived ({archived.length})
					</Button>
					{showArchived && renderCards(archived)}
				</section>
			)}
		</div>
	);
}

type Project = tables["project"] & { isMember: boolean; isArchived: boolean };

function ProjectCard({
	project,
	workspaceId,
	canOpen,
	canJoin,
	isJoining,
	onJoin,
}: {
	project: Project;
	workspaceId: string;
	canOpen: boolean;
	canJoin: boolean;
	isJoining: boolean;
	onJoin: () => void;
}) {
	return (
		<Card
			className={cn(
				"relative gap-0 p-0 transition-shadow duration-150",
				canOpen &&
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
				{canOpen ? (
					<Link
						to="/$id/projects/$projectId"
						params={{ id: workspaceId, projectId: project.id }}
						title={project.name}
						className="truncate text-sm font-semibold outline-none after:absolute after:inset-0"
					>
						{project.name}
					</Link>
				) : (
					<h3 className="truncate text-sm font-semibold" title={project.name}>
						{project.name}
					</h3>
				)}
				<p
					className="line-clamp-2 text-card-foreground/80"
					title={project.description || undefined}
				>
					{project.description || `Created ${formatDate(project.createdAt)}`}
				</p>
				<div className="mt-auto flex items-center justify-between pt-3">
					<span className="text-muted-foreground capitalize">
						{project.isArchived ? "Archived" : project.access}
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
						// An archived project can't be joined.
						canJoin &&
						!project.isArchived && (
							<Button
								variant={"secondary"}
								size={"sm"}
								disabled={isJoining}
								onClick={onJoin}
							>
								Join
							</Button>
						)
					)}
				</div>
			</div>
		</Card>
	);
}
