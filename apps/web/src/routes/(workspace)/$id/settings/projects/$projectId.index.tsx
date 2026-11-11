import type { tables } from "@smelp/db";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
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
	deleteProject,
	projectQueryOptions,
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

function ProjectDetailsForm({ project }: { project: tables["project"] }) {
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
			<ProjectDetailsForm key={project.id} project={project} />
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
