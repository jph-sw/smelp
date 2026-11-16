import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useId } from "react";
import * as v from "valibot";
import { useAppForm } from "#/hooks/form";
import { projectMembersQueryOptions } from "#/lib/data/project-members";
import { statesQueryOptions } from "#/lib/data/state";
import { toastError } from "#/lib/errors";
import { ISSUE_TYPES, type IssueType } from "#/lib/issue-types";
import { orpc } from "#/lib/orpc";
import { RichTextEditor } from "../rich-text/rich-text-editor";
import { Field, FieldGroup } from "../ui/field";
import { toast } from "../ui/toast";
import { AssigneeSelect } from "./assignee-select";
import type { CreateIssueDialogParams } from "./create-issue-dialog-store";
import { ISSUE_TYPE_ITEMS } from "./issue-type-icon";

const CreateIssueSchema = v.object({
	title: v.pipe(
		v.string(),
		v.minLength(1, "Enter a title."),
		v.maxLength(120, "Use at most 120 characters."),
	),
	description: v.string(),
	type: v.picklist(ISSUE_TYPES),
	assignee: v.nullable(v.string()),
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
	const { data: members } = useQuery(
		projectMembersQueryOptions({ projectId: params.projectId }),
	);
	const defaultState = states?.find((state) => state.isDefault);
	const queryClient = useQueryClient();
	const descriptionLabel = useId();
	const descriptionHint = useId();

	const form = useAppForm({
		defaultValues: {
			title: "",
			description: "",
			type: "task" as IssueType,
			assignee: null as string | null,
		},
		validators: {
			onSubmit: CreateIssueSchema,
		},
		onSubmit: async ({ value }) => {
			if (!defaultState) {
				toast({
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
					type: value.type,
					assignee: value.assignee ?? undefined,
					parentId: params.parentId,
					workspaceId: params.workspaceId,
					projectId: params.projectId,
				});
				toast({
					type: "success",
					description: `Work item "${res.title}" created.`,
				});
				queryClient.invalidateQueries({
					queryKey: ["issues", params.projectId],
				});
				queryClient.invalidateQueries({ queryKey: ["my-issues"] });
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
					children={(field) => (
						<Field>
							<div id={descriptionLabel} className="text-xs font-medium">
								Description
							</div>
							<RichTextEditor
								aria-labelledby={descriptionLabel}
								aria-describedby={descriptionHint}
								value={field.state.value}
								className="rounded-md border border-input px-2.5 py-1.5 focus-within:border-ring"
								onChange={field.handleChange}
							/>
							<p id={descriptionHint} className="text-xs text-muted-foreground">
								Type / for commands
							</p>
						</Field>
					)}
				/>
				<form.AppField
					name="type"
					children={(field) => (
						<field.SelectField label="Type" items={ISSUE_TYPE_ITEMS} />
					)}
				/>
				<form.AppField
					name="assignee"
					children={(field) => (
						<Field>
							{/* A FieldLabel would name the popup's search input "Assignee". */}
							<div className="text-xs font-medium text-foreground">
								Assignee
							</div>
							<AssigneeSelect
								value={field.state.value}
								members={members ?? []}
								className="w-full"
								onChange={field.handleChange}
							/>
						</Field>
					)}
				/>
			</FieldGroup>
			<form.AppForm>
				<form.SubscribeButton label="Create work item" />
			</form.AppForm>
		</form>
	);
}
