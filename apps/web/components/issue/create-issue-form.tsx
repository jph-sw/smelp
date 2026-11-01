import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as v from "valibot";
import { useAppForm } from "#/hooks/form";
import { statesQueryOptions } from "#/lib/data/state";
import { toastError } from "#/lib/errors";
import { orpc } from "#/lib/orpc";
import { FieldGroup } from "../ui/field";
import { toast } from "../ui/toast";
import type { CreateIssueDialogParams } from "./create-issue-dialog-store";

const CreateIssueSchema = v.object({
	title: v.pipe(
		v.string(),
		v.minLength(1, "Enter a title."),
		v.maxLength(120, "Use at most 120 characters."),
	),
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
	const queryClient = useQueryClient();

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
					description: `Work item "${res.title}" created.`,
				});
				queryClient.invalidateQueries({
					queryKey: ["issues", params.projectId],
				});
				onSuccess();
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
			<FieldGroup>
				<form.AppField
					name="title"
					children={(field) => <field.TextField label="Title" />}
				/>
				<form.AppField
					name="description"
					children={(field) => <field.TextAreaField label="Description" />}
				/>
			</FieldGroup>
			<form.AppForm>
				<form.SubscribeButton label="Create work item" />
			</form.AppForm>
		</form>
	);
}
