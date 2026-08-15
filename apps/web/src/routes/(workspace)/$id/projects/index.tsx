import { GearsIcon, UserIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { projectsQueryOptions } from "#/lib/data/project";

export const Route = createFileRoute("/(workspace)/$id/projects/")({
	component: RouteComponent,
	loader: ({ context: { queryClient }, params: { id } }) => {
		return queryClient.ensureQueryData(
			projectsQueryOptions({ workspaceId: id }),
		);
	},
});

function RouteComponent() {
	const navigate = Route.useNavigate();
	const { id: workspaceId } = Route.useParams();

	const { data: projects } = useSuspenseQuery(
		projectsQueryOptions({ workspaceId }),
	);

	return (
		<div>
			<div className="w-full grid md:grid-cols-3 xl:grid-cols-4 gap-4">
				{projects.map((project) => (
					<Card
						key={project.id}
						className="p-0 hover:cursor-pointer"
						onClick={() => {
							navigate({
								to: "/$id/projects/$projectId",
								params: { id: workspaceId, projectId: project.id },
							});
						}}
					>
						<CardContent className="p-0">
							<div className=" h-25 relative">
								<div className="w-full inset-0 z-1 bg-linear-to-t from-card/60 to-background/50 absolute" />
								<img
									aria-label="a"
									className="w-full absolute top-0 left-0 object-cover h-full"
									src="https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fimages.pexels.com%2Fphotos%2F20211127%2Fpexels-photo-20211127.jpeg%3Fcs%3Dsrgb%26dl%3Dpexels-robert-clark-504241532-20211127.jpg%26fm%3Djpg"
								/>
								<div className="absolute bottom-0 z-1 flex  h-10 w-full items-center justify-between gap-3 px-4">
									<div className="flex grow items-center gap-2 truncate">
										<div className="w-full flex flex-col justify-between gap-0.5 truncate">
											<h3 className="truncate font-semibold">{project.name}</h3>
										</div>
									</div>
									<div className="flex h-full shrink-0 items-center gap-2"></div>
								</div>
							</div>
							<div className="bg-card w-full flex-col justify-between p-4">
								<p className="text-card-foreground/80">
									{project.description ||
										`Project created on ${new Date(project.createdAt).toLocaleDateString()}`}
								</p>
								<div className="pt-2 items-center flex justify-between">
									<span className="flex gap-1">
										<HugeiconsIcon icon={UserIcon} className="h-4 w-4" />
										<HugeiconsIcon icon={UserIcon} className="h-4 w-4" />
									</span>
									<Button variant={"secondary"} size={"icon-sm"}>
										<HugeiconsIcon icon={GearsIcon} />
									</Button>
								</div>
							</div>
						</CardContent>
					</Card>
				))}
			</div>
		</div>
	);
}
