import { ORPCError } from "@orpc/client";
import type { tables } from "@smelp/db";
import * as v from "valibot";
import { useAppForm } from "#/hooks/form";
import { orpc } from "#/lib/orpc";
import { FieldGroup } from "../ui/field";
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
					access: value.access as "public" | "private",
					workspaceId: workspace.id,
				});
				toast.add({
					type: "success",
					description: `Project "${res.name}" created.`,
				});
				onSuccess();
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
