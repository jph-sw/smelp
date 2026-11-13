import type { tables } from "@smelp/db";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import * as v from "valibot";
import { useAppForm } from "#/hooks/form";
import { toastError } from "#/lib/errors";
import { orpc } from "#/lib/orpc";
import { DynamicIcon } from "../dynamic-icon";
import { Button } from "../ui/button";
import { FieldGroup } from "../ui/field";
import IconPicker from "../ui/icon-picker";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { toast } from "../ui/toast";

const CreateProjectSchema = v.object({
	id: v.pipe(
		v.string(),
		v.minLength(2, "Use at least 2 characters."),
		v.maxLength(5, "Use at most 5 characters."),
	),
	name: v.pipe(
		v.string(),
		v.trim(),
		v.minLength(2, "Use at least 2 characters."),
		v.maxLength(32, "Use at most 32 characters."),
	),
	description: v.string(),
	access: v.picklist(["public", "private"]),
});

export function CreateProjectForm({
	workspace,
	onSuccess,
}: {
	workspace: tables["workspace"];
	onSuccess: () => void;
}) {
	const [selectedIcon, setSelectedIcon] = useState<string>("AppWindowIcon");
	const queryClient = useQueryClient();

	const form = useAppForm({
		defaultValues: {
			id: "",
			name: "",
			description: "",
			access: "public",
		},
		validators: {
			onSubmit: CreateProjectSchema,
		},
		onSubmit: async ({ value }) => {
			try {
				const res = await orpc.project.create({
					id: value.id,
					name: value.name,
					description: value.description,
					icon: selectedIcon,
					access: value.access as "public" | "private",
					workspaceId: workspace.id,
				});
				toast({
					type: "success",
					description: `Project "${res.name}" created.`,
				});
				onSuccess();
				queryClient.invalidateQueries({ queryKey: ["projects"] });
			} catch (e) {
				toastError(e);
			}
		},
	});
	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				form.handleSubmit();
			}}
		>
			<FieldGroup className="grid grid-cols-4">
				<Popover>
					<PopoverTrigger
						className={"border col-span-4"}
						aria-label="Choose project icon"
						render={<Button className={"h-12 w-12"} variant={"secondary"} />}
					>
						<DynamicIcon className="size-8" name={selectedIcon} />
					</PopoverTrigger>
					<PopoverContent className="w-fit p-0">
						<IconPicker
							selectedIcon={selectedIcon}
							setSelectedIcon={setSelectedIcon}
							className="bg-transparent border-none"
						/>
					</PopoverContent>
				</Popover>
				<form.AppField
					name="name"
					children={(field) => (
						<field.TextField
							className="col-span-4 sm:col-span-2"
							label="Project name"
						/>
					)}
				/>
				<form.AppField
					name="id"
					children={(field) => (
						<field.TextField
							className="col-span-4 sm:col-span-2"
							label="Project ID (2–5 characters)"
						/>
					)}
				/>
				<form.AppField
					name="description"
					children={(field) => (
						<field.TextAreaField className="col-span-4" label="Description" />
					)}
				/>
				<form.AppField
					name="access"
					children={(field) => (
						<field.SelectField
							className="col-span-4 sm:col-span-2"
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
				<form.SubscribeButton label="Create project" />
			</form.AppForm>
		</form>
	);
}
