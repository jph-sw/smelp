import { ORPCError } from "@orpc/client";
import { useQuery } from "@tanstack/react-query";
import * as v from "valibot";
import { useAppForm } from "#/hooks/form";
import { statesQueryOptions } from "#/lib/data/state";
import { orpc } from "#/lib/orpc";
import { FieldGroup } from "../ui/field";
import { toast } from "../ui/toast";
import type { CreateIssueDialogParams } from "./create-issue-dialog-store";

const CreateIssueSchema = v.object({
	title: v.pipe(v.string(), v.minLength(1), v.maxLength(120)),
	description: v.string(),
});

export function CreateIssueForm({
	params,
	onSuccess,
}: {
	params: CreateIssueDialogParams;
	onSuccess: () => void;
}) {
	const { data: states } = useQuery(
		statesQueryOptions({ projectId: params.projectId }),
	);
	const defaultState = states?.find((state) => state.isDefault);

	const form = useAppForm({
		defaultValues: {
			title: "",
			description: "",
		},
		validators: {
			onSubmit: CreateIssueSchema,
		},
		onSubmit: async ({ value }) => {
			if (!defaultState) {
				toast.add({
					type: "error",
					description: "No default state found for this project.",
				});
				return;
			}

			try {
				const res = await orpc.issue.create({
					title: value.title,
					description: value.description,
					state: defaultState.id,
					type: "task",
					parentId: params.parentId,
					workspaceId: params.workspaceId,
					projectId: params.projectId,
				});
				toast.add({
					type: "success",
					description: `Issue "${res.title}" created.`,
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
			<FieldGroup>
				<form.AppField
					name="title"
					children={(field) => <field.TextField label="Title" />}
				/>
				<form.AppField
					name="description"
					children={(field) => (
						<field.TextAreaField label="Description" />
					)}
				/>
			</FieldGroup>
			<form.AppForm>
				<form.SubscribeButton label="Create issue" />
			</form.AppForm>
		</form>
	);
}
