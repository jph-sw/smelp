import {
	ArrowUpNarrowWideIcon,
	AttachmentIcon,
	ChartRelationshipIcon,
	FilterIcon,
	HistoryIcon,
	LayerIcon,
	LinkIcon,
	SmilePlus,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { ProjectHeader } from "#/components/project/project-header";
import { Button } from "#/components/ui/button";
import { issueQueryOptions } from "#/lib/data/issue";

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
		<div className="h-full w-full relative overflow-hidden">
			<ProjectHeader workspaceId={workspaceId} projectId={issue.projectId} />
			<div className="h-10 w-full border-b flex items-center px-4">
				<span className="font-medium text-sm tracking-wide">{issue.id}</span>
			</div>
			<div className="h-full w-full overflow-hidden">
				<div className="relative w-full h-full overflow-hidden">
					<div className="flex h-full w-full overflow-hidden">
						<div className="h-full w-full space-y-6 overflow-y-auto px-9 py-5">
							<div className="space-y-4 rounded-lg">
								<div className="mb-2.5 flex items-center justify-between gap-4">
									<div className="flex shrink-0 items-center space-x-2">
										<button
											type="button"
											className="font-medium whitespace-nowrap cursor-pointer text-foreground/60 text-sm"
										>
											{issue.id}
										</button>
									</div>
									<div className="flex items-center gap-3">
										<div className="flex items-center gap-x-2 transition-all duration-300 fade-out">
											<div className="hidden">Saved</div>
										</div>
									</div>
								</div>
								<div className="flex flex-col gap-1.5">
									<div className="relative -ml-3">
										<span className="px-3 py-0 font-semibold rounded-sm w-full block text-xl">
											{issue.title}
										</span>
									</div>
								</div>
								<div className="text-lg w-full max-w-full relative pb-3 pl-3 -ml-6 p-0! pl-6!">
									{issue.description}
								</div>
								<div className="flex items-center justify-between gap-2">
									<div className="relative mt-4 shrink-0">
										<Button variant={"ghost"} size={"icon-lg"}>
											<HugeiconsIcon icon={SmilePlus} />
										</Button>
									</div>
									<div className="shrink-0">
										<div className="relative w-min text-left">
											<Button variant={"ghost"} size={"sm"}>
												<HugeiconsIcon icon={HistoryIcon} />
												Last edited by jph-bsw 2 days ago
											</Button>
										</div>
									</div>
								</div>
							</div>
							<div className="flex gap-2">
								<Button variant={"outline"}>
									<HugeiconsIcon icon={LayerIcon} /> Add sub-work item
								</Button>
								<Button variant={"outline"}>
									<HugeiconsIcon icon={ChartRelationshipIcon} /> Add relation
								</Button>
								<Button variant={"outline"}>
									<HugeiconsIcon icon={LinkIcon} /> Add link
								</Button>
								<Button variant={"outline"}>
									<HugeiconsIcon icon={AttachmentIcon} /> Attach
								</Button>
							</div>
							<div className="space-y-4">
								<div className="flex items-center justify-between">
									<div className="text-lg font-semibold">Activity</div>
									<div className="flex items-center gap-2">
										<Button variant={"secondary"} size={"icon"}>
											<HugeiconsIcon icon={ArrowUpNarrowWideIcon} />
										</Button>
										<Button variant={"secondary"} size={"icon"}>
											<HugeiconsIcon icon={FilterIcon} />
										</Button>
									</div>
								</div>
							</div>
						</div>
						<div className="h-full w-full min-w-[300px] shrink-0 border-l border-subtle sm:w-1/2 md:w-1/4 lg:min-w-80 xl:min-w-96"></div>
					</div>
				</div>
			</div>
		</div>
	);
}
