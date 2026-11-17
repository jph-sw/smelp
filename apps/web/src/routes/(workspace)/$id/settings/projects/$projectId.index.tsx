import type { tables } from "@smelp/db";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
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
import { backgroundAsBase64, ImageFileError } from "#/lib/data/image-upload";
import {
	archiveProject,
	deleteProject,
	projectQueryOptions,
	removeProjectBackground,
	setProjectBackground,
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
				toast({ type: "success", description: "Project updated." });
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

function BoardBackgroundCard({
	project,
	disabled,
}: {
	project: tables["project"];
	disabled: boolean;
}) {
	const queryClient = useQueryClient();
	const fileInput = useRef<HTMLInputElement>(null);
	const [isSaving, setIsSaving] = useState(false);

	const change = async (action: () => Promise<unknown>, done: string) => {
		setIsSaving(true);
		try {
			await action();
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ["project", project.id] }),
				queryClient.invalidateQueries({
					queryKey: ["projects", project.workspaceId],
				}),
			]);
			toast({ type: "success", description: done });
		} catch (e) {
			if (e instanceof ImageFileError) {
				toast({ type: "error", description: e.message });
			} else {
				toastError(e);
			}
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<Card>
			<CardContent>
				<div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex flex-col gap-4 sm:flex-row sm:items-center">
						{project.backgroundImage ? (
							<img
								src={project.backgroundImage}
								alt="Current board background"
								className="aspect-video w-48 shrink-0 rounded-md object-cover"
							/>
						) : (
							<div className="aspect-video w-48 shrink-0 rounded-md bg-muted" />
						)}
						<div>
							<h3 className="text-sm font-semibold">Board background</h3>
							<p className="text-card-foreground/70">
								A faint image behind this project's board.
							</p>
						</div>
					</div>
					<div className="flex shrink-0 gap-2">
						<input
							ref={fileInput}
							type="file"
							accept="image/png,image/jpeg,image/webp"
							className="hidden"
							aria-label="Choose a background image"
							onChange={(e) => {
								const file = e.target.files?.[0];
								// Lets the same file be chosen again after an error.
								e.target.value = "";
								if (!file) return;
								change(
									async () =>
										setProjectBackground({
											projectId: project.id,
											image: await backgroundAsBase64(file),
										}),
									"Board background updated.",
								);
							}}
						/>
						<Button
							type="button"
							variant="outline"
							disabled={disabled || isSaving}
							onClick={() => fileInput.current?.click()}
						>
							{project.backgroundImage ? "Change image" : "Upload image"}
						</Button>
						{project.backgroundImage && (
							<Button
								type="button"
								variant="ghost"
								disabled={disabled || isSaving}
								onClick={() =>
									change(
										() => removeProjectBackground({ projectId: project.id }),
										"Board background removed.",
									)
								}
							>
								Remove
							</Button>
						)}
					</div>
				</div>
			</CardContent>
		</Card>
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
	const isArchived = project.archivedAt !== null;

	const handleArchive = async () => {
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
			toast({
				type: "success",
				description: isArchived ? "Project unarchived." : "Project archived.",
			});
		} catch (e) {
			toastError(e);
		}
	};

	const handleDelete = async () => {
		try {
			await deleteProject({ projectId });
			await queryClient.invalidateQueries({
				queryKey: ["projects", workspaceId],
			});
			toast({
				type: "success",
				description: "Project deleted.",
			});
			navigate({ to: "/$id", params: { id: workspaceId } });
		} catch (e) {
			toastError(e);
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
			<BoardBackgroundCard project={project} disabled={isArchived} />
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
							<AlertDialog
								pendingAnnouncement={
									isArchived ? "Unarchiving project" : "Archiving project"
								}
							>
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
										<AlertDialogCancel>Cancel</AlertDialogCancel>
										<AlertDialogAction action={handleArchive}>
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
							<AlertDialog pendingAnnouncement="Deleting project">
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
										<AlertDialogCancel>Cancel</AlertDialogCancel>
										<AlertDialogAction
											variant={"destructive"}
											action={handleDelete}
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
