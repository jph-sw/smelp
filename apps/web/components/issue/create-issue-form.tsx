import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import * as v from "valibot";
import { useAppForm } from "#/hooks/form";
import {
	deleteCreateIssueDraft,
	isEmptyCreateIssueDraft,
	readCreateIssueDraft,
	saveCreateIssueDraft,
} from "#/lib/create-issue-draft";
import { invalidateCycles } from "#/lib/data/cycle";
import { moduleQueryKeys } from "#/lib/data/module";
import { projectMembersQueryOptions } from "#/lib/data/project-members";
import { statesQueryOptions } from "#/lib/data/state";
import { toastError } from "#/lib/errors";
import { ISSUE_PRIORITIES } from "#/lib/issue-priorities";
import { ISSUE_TYPES } from "#/lib/issue-types";
import { orpc } from "#/lib/orpc";
import { RichTextEditor } from "../rich-text/rich-text-editor";
import { Button } from "../ui/button";
import { Field, FieldGroup } from "../ui/field";
import { toast } from "../ui/toast";
import { AssigneeSelect } from "./assignee-select";
import type { CreateIssueDialogParams } from "./create-issue-dialog-store";
import { ISSUE_PRIORITY_ITEMS } from "./issue-priority-icon";
import { ISSUE_TYPE_ITEMS } from "./issue-type-icon";

const CreateIssueSchema = v.object({
	title: v.pipe(
		v.string(),
		v.minLength(1, "Enter a title."),
		v.maxLength(120, "Use at most 120 characters."),
	),
	description: v.string(),
	type: v.picklist(ISSUE_TYPES),
	priority: v.picklist(ISSUE_PRIORITIES),
	assignee: v.nullable(v.string()),
});

export function CreateIssueForm({
	params,
	onSuccess,
	onDiscard,
}: {
	params: CreateIssueDialogParams;
	onSuccess: () => void;
	onDiscard: () => void;
}) {
	const { data: states } = useQuery(
		statesQueryOptions({ projectId: params.projectId }),
	);
	const { data: members } = useQuery(
		projectMembersQueryOptions({ projectId: params.projectId }),
	);
	const { destination } = params;
	const stateId =
		destination?.kind === "state"
			? destination.id
			: states?.find((state) => state.isDefault)?.id;
	const queryClient = useQueryClient();
	const descriptionLabel = useId();
	const descriptionHint = useId();
	const [defaultValues] = useState(() => readCreateIssueDraft(params));

	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: CreateIssueSchema,
		},
		listeners: {
			onChange: ({ formApi }) => {
				saveCreateIssueDraft(params, formApi.state.values);
			},
		},
		onSubmit: async ({ value }) => {
			if (!stateId) {
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
					state: stateId,
					type: value.type,
					priority: value.priority,
					assignee: value.assignee ?? undefined,
					parentId: params.parentId,
					cycleId: destination?.kind === "cycle" ? destination.id : undefined,
					moduleId: destination?.kind === "module" ? destination.id : undefined,
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
				if (destination?.kind === "cycle") {
					invalidateCycles(queryClient, params.projectId);
				}
				if (destination?.kind === "module") {
					for (const queryKey of moduleQueryKeys(params.projectId)) {
						queryClient.invalidateQueries({ queryKey });
					}
				}
				deleteCreateIssueDraft(params);
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
					name="priority"
					children={(field) => (
						<field.SelectField label="Priority" items={ISSUE_PRIORITY_ITEMS} />
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
			<div className="mt-4 flex items-center gap-2">
				<form.AppForm>
					<form.SubscribeButton label="Create work item" className="mt-0" />
				</form.AppForm>
				<form.Subscribe
					selector={(state) => ({
						hasDraft: !isEmptyCreateIssueDraft(state.values),
						isSubmitting: state.isSubmitting,
					})}
				>
					{({ hasDraft, isSubmitting }) =>
						hasDraft && (
							<Button
								type="button"
								variant="ghost"
								disabled={isSubmitting}
								onClick={() => {
									deleteCreateIssueDraft(params);
									onDiscard();
								}}
							>
								Discard draft
							</Button>
						)
					}
				</form.Subscribe>
			</div>
		</form>
	);
}
