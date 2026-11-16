import type { tables } from "@smelp/db";
import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import * as v from "valibot";
import { DynamicIcon } from "#/components/dynamic-icon";
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
import { Switch } from "#/components/ui/switch";
import { toast } from "#/components/ui/toast";
import { useAppForm } from "#/hooks/form";
import { usePageTitle } from "#/hooks/use-page-title";
import { instanceStatusQueryOptions } from "#/lib/data/instance";
import { projectsQueryOptions } from "#/lib/data/project";
import {
	deleteWorkspace,
	updateWorkspace,
	workspaceQueryOptions,
} from "#/lib/data/workspace";
import { toastError } from "#/lib/errors";
import { useWorkspaceAccess } from "#/lib/workspace-viewer";

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
	loader: ({ context: { queryClient } }) =>
		queryClient.ensureQueryData(instanceStatusQueryOptions),
});

function RouteComponent() {
	usePageTitle("Workspace settings");
	const { id: workspaceId } = Route.useParams();
	const navigate = Route.useNavigate();
	const queryClient = useQueryClient();
	const workspaceQuery = workspaceQueryOptions({ workspaceId });
	const { data: workspace } = useSuspenseQuery(workspaceQuery);
	const { canManage } = useWorkspaceAccess();
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
			<PublicWorkspaceCard workspace={workspace} />
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

// New projects start out public, so the card lists what turning this on would
// show before anyone flips it.
function PublicWorkspaceCard({
	workspace,
}: {
	workspace: tables["workspace"];
}) {
	const queryClient = useQueryClient();
	const { data: status } = useSuspenseQuery(instanceStatusQueryOptions);
	const { data: projects } = useSuspenseQuery(
		projectsQueryOptions({ workspaceId: workspace.id }),
	);
	const visible = projects.filter((project) => project.access === "public");
	const isOn = workspace.public === 1;

	const { mutate: setPublic, isPending } = useMutation({
		mutationFn: (on: boolean) =>
			updateWorkspace({ workspaceId: workspace.id, public: on }),
		onError: (e) => toastError(e),
		onSettled: () =>
			Promise.all([
				queryClient.invalidateQueries({
					queryKey: workspaceQueryOptions({ workspaceId: workspace.id })
						.queryKey,
				}),
				queryClient.invalidateQueries({ queryKey: ["public-workspaces"] }),
			]),
	});

	return (
		<Card>
			<CardContent className="space-y-4">
				<div className="flex items-center justify-between gap-4">
					<div>
						<h3 id="public-workspace-label" className="text-sm font-semibold">
							Public workspace
						</h3>
						<p className="text-card-foreground/70">
							Anyone can read this workspace's public projects, without an
							account. Only members can change anything.
						</p>
					</div>
					<Switch
						aria-labelledby="public-workspace-label"
						checked={isOn}
						disabled={isPending}
						onCheckedChange={(on) => setPublic(on)}
					/>
				</div>
				{!status.publicAccess && (
					<p role="note" className="rounded-sm bg-muted px-3 py-2">
						Public access is off for this instance.{" "}
						{isOn ? "This" : "Turning this on"} takes effect once an instance
						admin makes the instance public.
					</p>
				)}
				<div className="space-y-1">
					<h4 className="text-xs font-medium text-muted-foreground">
						{isOn && status.publicAccess
							? "Anyone can read these projects"
							: "Anyone could read these projects"}
					</h4>
					{visible.length === 0 ? (
						<p className="text-card-foreground/70">
							None. Every project here is private.
						</p>
					) : (
						<ul className="divide-y">
							{visible.map((project) => (
								<li key={project.id} className="flex items-center gap-2 py-1.5">
									<DynamicIcon
										name={project.icon}
										className="size-4 shrink-0"
									/>
									<span className="min-w-0 flex-1 truncate">
										{project.name}
									</span>
									{project.isArchived && (
										<span className="text-xs text-muted-foreground">
											Archived
										</span>
									)}
									<Link
										to="/$id/settings/projects/$projectId"
										params={{ id: workspace.id, projectId: project.id }}
										aria-label={`${project.name} settings`}
										className="text-xs underline underline-offset-3"
									>
										Settings
									</Link>
								</li>
							))}
						</ul>
					)}
				</div>
				<p className="text-card-foreground/70">
					A project stays hidden once it's made private in its settings.
				</p>
			</CardContent>
		</Card>
	);
}
