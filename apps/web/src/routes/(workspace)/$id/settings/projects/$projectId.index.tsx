import type { tables } from "@smelp/db";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import * as v from "valibot";
import { DynamicIcon } from "#/components/dynamic-icon";
import { ArchivedBanner } from "#/components/project/archived-banner";
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
import { FieldGroup } from "#/components/ui/field";
import IconPicker from "#/components/ui/icon-picker";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "#/components/ui/popover";
import { toast } from "#/components/ui/toast";
import { useAppForm } from "#/hooks/form";
import { usePageTitle } from "#/hooks/use-page-title";
import {
	archiveProject,
	deleteProject,
	projectQueryOptions,
	unarchiveProject,
	updateProject,
} from "#/lib/data/project";
import { useProjectAccess } from "#/lib/data/project-members";
import { toastError } from "#/lib/errors";

const ProjectDetailsSchema = v.object({
	name: v.pipe(
		v.string(),
		v.trim(),
		v.minLength(2, "Use at least 2 characters."),
		v.maxLength(32, "Use at most 32 characters."),
	),
	description: v.pipe(
		v.string(),
		v.maxLength(2000, "Use at most 2000 characters."),
	),
	access: v.picklist(["public", "private"]),
});

function ProjectDetailsForm({
	project,
	disabled,
}: {
	project: tables["project"];
	disabled: boolean;
}) {
	const queryClient = useQueryClient();
	const [icon, setIcon] = useState(project.icon);

	const form = useAppForm({
		defaultValues: {
			name: project.name,
			description: project.description ?? "",
			access: project.access,
		},
		validators: { onSubmit: ProjectDetailsSchema },
		onSubmit: async ({ value }) => {
			try {
				await updateProject({
					projectId: project.id,
					name: value.name,
					description: value.description,
					access: value.access as "public" | "private",
					icon,
				});
				await Promise.all([
					queryClient.invalidateQueries({ queryKey: ["project", project.id] }),
					queryClient.invalidateQueries({
						queryKey: ["projects", project.workspaceId],
					}),
				]);
				toast.add({ type: "success", description: "Project updated." });
			} catch (e) {
				toastError(e);
			}
		},
	});

	return (
		<form
			className="max-w-md"
			onSubmit={(e) => {
				e.preventDefault();
				form.handleSubmit();
			}}
		>
			{/* An archived project's settings are read-only; a fieldset disables every control in it. */}
			<fieldset disabled={disabled} className="contents">
				<FieldGroup>
					<Popover>
						<PopoverTrigger
							aria-label="Choose project icon"
							render={<Button className="size-12" variant="secondary" />}
						>
							<DynamicIcon className="size-8" name={icon} />
						</PopoverTrigger>
						<PopoverContent className="w-fit p-0">
							<IconPicker
								selectedIcon={icon}
								setSelectedIcon={setIcon}
								className="border-none bg-transparent"
							/>
						</PopoverContent>
					</Popover>
					<form.AppField
						name="name"
						children={(field) => <field.TextField label="Project name" />}
					/>
					<form.AppField
						name="description"
						children={(field) => <field.TextAreaField label="Description" />}
					/>
					<form.AppField
						name="access"
						children={(field) => (
							<field.SelectField
								label="Access"
								items={[
									{ value: "public", label: "Public" },
									{ value: "private", label: "Private" },
								]}
							/>
						)}
					/>
				</FieldGroup>
				<form.AppForm>
					<form.SubscribeButton label="Save changes" />
				</form.AppForm>
			</fieldset>
		</form>
	);
}

export const Route = createFileRoute(
	"/(workspace)/$id/settings/projects/$projectId/",
)({
	component: RouteComponent,
});

function RouteComponent() {
	usePageTitle("Project settings");
	const { id: workspaceId, projectId } = Route.useParams();
	const navigate = Route.useNavigate();
	const queryClient = useQueryClient();
	const projectQuery = projectQueryOptions({ projectId });
	const { data: project } = useSuspenseQuery(projectQuery);
	const { canManage } = useProjectAccess(projectId);
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [isArchiveOpen, setIsArchiveOpen] = useState(false);
	const [isArchiving, setIsArchiving] = useState(false);
	const isArchived = project.archivedAt !== null;

	const handleArchive = async () => {
		setIsArchiving(true);
		try {
			if (isArchived) {
				await unarchiveProject({ projectId });
			} else {
				await archiveProject({ projectId });
			}
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ["project", projectId] }),
				queryClient.invalidateQueries({ queryKey: ["projects", workspaceId] }),
				queryClient.invalidateQueries({ queryKey: ["my-issues"] }),
			]);
			toast.add({
				type: "success",
				description: isArchived ? "Project unarchived." : "Project archived.",
			});
		} catch (e) {
			toastError(e);
		} finally {
			setIsArchiving(false);
			setIsArchiveOpen(false);
		}
	};

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
			toastError(e);
		} finally {
			setIsDeleting(false);
			setIsDeleteOpen(false);
		}
	};

	if (!canManage) {
		return (
			<p className="text-sm text-muted-foreground">
				Only project admins can change these settings.
			</p>
		);
	}

	return (
		<div className="space-y-12">
			{isArchived && <ArchivedBanner />}
			<ProjectDetailsForm
				key={project.id}
				project={project}
				disabled={isArchived}
			/>
			<Card>
				<CardContent>
					<div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<h3 className="text-sm font-semibold">
								{isArchived ? "Unarchive this project" : "Archive this project"}
							</h3>
							<p className="text-card-foreground/70">
								{isArchived
									? "Make the project editable again and bring it back to the sidebar and the projects list."
									: "Make the project read-only and hide it from the sidebar, the projects list and My work. Nothing is deleted, and you can unarchive it at any time."}
							</p>
						</div>
						<div className="shrink-0">
							<AlertDialog open={isArchiveOpen} onOpenChange={setIsArchiveOpen}>
								<AlertDialogTrigger render={<Button variant={"outline"} />}>
									{isArchived ? "Unarchive" : "Archive"}
								</AlertDialogTrigger>
								<AlertDialogContent>
									<AlertDialogHeader>
										<AlertDialogTitle>
											{isArchived ? "Unarchive" : "Archive"} "{project.name}"?
										</AlertDialogTitle>
										<AlertDialogDescription>
											{isArchived
												? "Members will be able to create, edit and move work items again."
												: "No one will be able to create, edit, move or comment on work items, or change the project's settings, until it is unarchived."}
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel disabled={isArchiving}>
											Cancel
										</AlertDialogCancel>
										<AlertDialogAction
											disabled={isArchiving}
											onClick={handleArchive}
										>
											{isArchived ? "Unarchive project" : "Archive project"}
										</AlertDialogAction>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
						</div>
					</div>
				</CardContent>
			</Card>
			<Card>
				<CardContent>
					<div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<h3 className="text-sm font-semibold">Delete this project</h3>
							<p className="text-card-foreground/70">
								When deleting a project, all of the data and resources within
								that project will be permanently removed and cannot be
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
											Delete "{project.name}"?
										</AlertDialogTitle>
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
