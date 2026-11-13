import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import * as v from "valibot";
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
import { toast } from "#/components/ui/toast";
import { useAppForm } from "#/hooks/form";
import { usePageTitle } from "#/hooks/use-page-title";
import {
	deleteWorkspace,
	updateWorkspace,
	workspaceQueryOptions,
} from "#/lib/data/workspace";
import { useWorkspaceAccess } from "#/lib/data/workspace-members";
import { toastError } from "#/lib/errors";

const UpdateWorkspaceSchema = v.object({
	name: v.pipe(
		v.string(),
		v.trim(),
		v.minLength(2, "Use at least 2 characters."),
		v.maxLength(32, "Use at most 32 characters."),
	),
});

export const Route = createFileRoute("/(workspace)/$id/settings/workspace/")({
	component: RouteComponent,
});

function RouteComponent() {
	usePageTitle("Workspace settings");
	const { id: workspaceId } = Route.useParams();
	const navigate = Route.useNavigate();
	const queryClient = useQueryClient();
	const workspaceQuery = workspaceQueryOptions({ workspaceId });
	const { data: workspace } = useSuspenseQuery(workspaceQuery);
	const { canManage } = useWorkspaceAccess(workspaceId);
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);

	const handleDelete = async () => {
		setIsDeleting(true);
		try {
			await deleteWorkspace({ workspaceId });
			await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
			toast({
				type: "success",
				description: "Workspace deleted.",
			});
			navigate({ to: "/" });
		} catch (e) {
			toastError(e);
		} finally {
			setIsDeleting(false);
			setIsDeleteOpen(false);
		}
	};

	const form = useAppForm({
		defaultValues: {
			name: workspace.name,
		},
		validators: {
			onSubmit: UpdateWorkspaceSchema,
		},
		onSubmit: async ({ value }) => {
			try {
				await updateWorkspace({ workspaceId, name: value.name });
				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: workspaceQuery.queryKey,
					}),
					queryClient.invalidateQueries({ queryKey: ["workspaces"] }),
				]);
				toast({
					type: "success",
					description: "Workspace updated.",
				});
			} catch (e) {
				toastError(e);
			}
		},
	});

	if (!canManage) {
		return (
			<p className="text-sm text-muted-foreground">
				Only workspace admins can change these settings.
			</p>
		);
	}

	return (
		<div className="space-y-12">
			<form
				onSubmit={(e) => {
					e.preventDefault();
					form.handleSubmit();
				}}
				className="max-w-sm"
			>
				<form.AppField
					name="name"
					children={(field) => <field.TextField label="Workspace name" />}
				/>
				<form.AppForm>
					<form.SubscribeButton label="Update workspace" />
				</form.AppForm>
			</form>
			<Card>
				<CardContent>
					<div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<h3 className="text-sm font-semibold">Delete this workspace</h3>
							<p className="text-card-foreground/70">
								When deleting a workspace, all of the data and resources within
								that workspace will be permanently removed and cannot be
								recovered.
							</p>
						</div>
						<div className="shrink-0">
							<AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
								<AlertDialogTrigger render={<Button variant={"destructive"} />}>
									Delete
								</AlertDialogTrigger>
								<AlertDialogContent>
									<AlertDialogHeader>
										<AlertDialogTitle>
											Delete "{workspace.name}"?
										</AlertDialogTitle>
										<AlertDialogDescription>
											This will permanently delete the workspace and all of its
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
											Delete workspace
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
