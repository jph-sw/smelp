import { ORPCError } from "@orpc/client";
import type { tables } from "@smelp/db";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import * as v from "valibot";
import { useAppForm } from "#/hooks/form";
import { orpc } from "#/lib/orpc";
import { DynamicIcon } from "../dynamic-icon";
import { Button } from "../ui/button";
import { FieldGroup } from "../ui/field";
import IconPicker from "../ui/icon-picker";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { toast } from "../ui/toast";

const CreateProjectSchema = v.object({
	id: v.pipe(v.string(), v.minLength(2), v.maxLength(5)),
	name: v.pipe(v.string(), v.minLength(6), v.maxLength(32)),
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
				toast.add({
					type: "success",
					description: `Project "${res.name}" created.`,
				});
				onSuccess();
				queryClient.invalidateQueries({ queryKey: ["projects"] });
			} catch (e) {
				if (e instanceof ORPCError) {
					toast.add({
						type: "error",
						description: e.message,
					});
				}
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
						<field.TextField className="col-span-2" label="Project name" />
					)}
				/>
				<form.AppField
					name="id"
					children={(field) => (
						<field.TextField className="col-span-2" label="Project id" />
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
							className="col-span-1"
							label="Description"
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
