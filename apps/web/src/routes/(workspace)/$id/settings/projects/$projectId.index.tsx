import { ORPCError } from "@orpc/client";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
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
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { Separator } from "#/components/ui/separator";
import { toast } from "#/components/ui/toast";
import { deleteProject, projectQueryOptions } from "#/lib/data/project";

export const Route = createFileRoute(
	"/(workspace)/$id/settings/projects/$projectId/",
)({
	component: RouteComponent,
});

function RouteComponent() {
	const { id: workspaceId, projectId } = Route.useParams();
	const navigate = Route.useNavigate();
	const queryClient = useQueryClient();
	const projectQuery = projectQueryOptions({ projectId });
	const { data: project } = useSuspenseQuery(projectQuery);
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);

	const handleDelete = async () => {
		setIsDeleting(true);
		try {
			await deleteProject({ projectId });
			await queryClient.invalidateQueries({
				queryKey: ["projects", workspaceId],
			});
			toast.add({
				type: "success",
				description: "Project deleted.",
			});
			navigate({ to: "/$id", params: { id: workspaceId } });
		} catch (e) {
			if (e instanceof ORPCError) {
				toast.add({
					type: "error",
					description: e.message,
				});
			}
		} finally {
			setIsDeleting(false);
			setIsDeleteOpen(false);
		}
	};

	return (
		<div>
			{" "}
			<Card>
				<CardContent>
					<div className="w-full grid grid-cols-3">
						<div className="col-span-2">
							<h3 className="text-md font-semibold">Archive</h3>
							<p className="text-card-foreground/70">
								Archiving a project will unlist your project from your side
								navigation although you will still be able to access it from
								your projects page. You can restore the project or delete it
								whenever you want.
							</p>
						</div>
						<div className="items-center flex ms-auto">
							<Button variant={"destructive"}>Delete</Button>
						</div>
					</div>
					<Separator className={"my-4"} />
					<div className="w-full grid grid-cols-3">
						<div className="col-span-2">
							<h3 className="text-md font-semibold">Delete this project</h3>
							<p className="text-card-foreground/70">
								When deleting a project, all of the data and resources within
								that project will be permanently removed and cannot be
								recovered.
							</p>
						</div>
						<div className="items-center flex ms-auto">
							<AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
								<AlertDialogTrigger render={<Button variant={"destructive"} />}>
									Delete
								</AlertDialogTrigger>
								<AlertDialogContent>
									<AlertDialogHeader>
										<AlertDialogTitle>Delete "{project.name}"?</AlertDialogTitle>
										<AlertDialogDescription>
											This will permanently delete the project and all of its
											data and resources. This action cannot be undone.
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel disabled={isDeleting}>
											Cancel
										</AlertDialogCancel>
										<AlertDialogAction
											variant={"destructive"}
											disabled={isDeleting}
											onClick={handleDelete}
										>
											Delete project
										</AlertDialogAction>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
