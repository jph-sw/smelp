import type { ProjectMember, tables } from "@smelp/db";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { invalidateCycles } from "#/lib/data/cycle";
import { deleteIssue } from "#/lib/data/issue";
import { moduleQueryKeys } from "#/lib/data/module";
import { toastError } from "#/lib/errors";
import { type IssuePriority, isIssuePriority } from "#/lib/issue-priorities";
import { type IssueType, isIssueType } from "#/lib/issue-types";
import { formatDate, formatRelativeTime } from "#/lib/utils";
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
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectItemIcon,
	SelectTrigger,
	SelectValueWithIcon,
} from "../ui/select";
import { toast } from "../ui/toast";
import { AssigneeSelect } from "./assignee-select";
import { ISSUE_PRIORITY_ITEMS } from "./issue-priority-icon";
import { ISSUE_TYPE_ITEMS } from "./issue-type-icon";
import { type ParentOption, ParentSelect } from "./parent-select";

const NO_MODULE = "none";
const NO_CYCLE = "none";

type IssueDetail = tables["issue"] & {
	createdByName: string | null;
	updatedByName: string | null;
};

function PropertySelect({
	label,
	value,
	items,
	disabled,
	onChange,
}: {
	label: string;
	value: string;
	items: { label: string; value: string; icon?: ReactNode }[];
	disabled: boolean;
	onChange: (value: string) => void;
}) {
	return (
		<div className="grid grid-cols-[5.5rem_1fr] items-center gap-2">
			<span className="text-muted-foreground">{label}</span>
			<Select
				items={items}
				value={value}
				disabled={disabled}
				onValueChange={(next) => next != null && onChange(next)}
			>
				<SelectTrigger
					aria-label={label}
					className="w-full min-w-0 border-transparent bg-transparent px-2 hover:border-transparent hover:bg-accent disabled:after:hidden"
				>
					<SelectValueWithIcon
						icon={items.find((item) => item.value === value)?.icon}
					/>
				</SelectTrigger>
				<SelectContent>
					{items.map((item) => (
						<SelectItem key={item.value} value={item.value}>
							{item.icon && <SelectItemIcon>{item.icon}</SelectItemIcon>}
							{item.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

function PersonAndTime({
	label,
	name,
	time,
}: {
	label: string;
	name: string | null;
	time: number;
}) {
	return (
		<div className="grid grid-cols-[5.5rem_1fr] items-center gap-2">
			<span className="text-muted-foreground">{label}</span>
			<span className="px-2" title={formatDate(time)}>
				{name ? `${name}, ` : ""}
				{formatRelativeTime(time)}
			</span>
		</div>
	);
}

export function IssueProperties({
	issue,
	workspaceId,
	states,
	members,
	canWrite,
	parentOptions,
	modules,
	cycles,
	onUpdate,
}: {
	issue: IssueDetail;
	workspaceId: string;
	states: tables["state"][];
	members: ProjectMember[];
	canWrite: boolean;
	/** Work items this one may sit under: same project, never itself or its own sub-items. */
	parentOptions: ParentOption[];
	modules: { id: string; name: string }[];
	/** The project's cycles, for the Cycle selector. */
	cycles: { id: string; name: string }[];
	onUpdate: (changes: {
		type?: IssueType;
		priority?: IssuePriority;
		state?: string;
		assignee?: string | null;
		parentId?: string | null;
		moduleId?: string | null;
		cycleId?: string | null;
	}) => void;
}) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	const { mutateAsync: remove } = useMutation({
		mutationFn: deleteIssue,
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: ["issues", issue.projectId],
				}),
				...moduleQueryKeys(issue.projectId).map((queryKey) =>
					queryClient.invalidateQueries({ queryKey }),
				),
				queryClient.invalidateQueries({ queryKey: ["my-issues"] }),
				invalidateCycles(queryClient, issue.projectId),
			]);
			toast({ type: "success", description: `Deleted ${issue.id}.` });
			navigate({
				to: "/$id/projects/$projectId",
				params: { id: workspaceId, projectId: issue.projectId },
			});
		},
		onError: (e) => {
			toastError(e);
		},
	});

	return (
		<div className="flex flex-col gap-1 py-4 lg:p-4">
			<PropertySelect
				label="Type"
				value={issue.type}
				disabled={!canWrite}
				onChange={(type) => isIssueType(type) && onUpdate({ type })}
				items={ISSUE_TYPE_ITEMS}
			/>
			<PropertySelect
				label="Priority"
				value={issue.priority}
				disabled={!canWrite}
				onChange={(priority) =>
					isIssuePriority(priority) && onUpdate({ priority })
				}
				items={ISSUE_PRIORITY_ITEMS}
			/>
			<PropertySelect
				label="State"
				value={issue.state}
				disabled={!canWrite}
				onChange={(state) => onUpdate({ state })}
				items={states.map((state) => ({
					label: state.name,
					value: state.id,
				}))}
			/>
			<div className="grid grid-cols-[5.5rem_1fr] items-center gap-2">
				<span className="text-muted-foreground">Assignee</span>
				<AssigneeSelect
					value={issue.assignee}
					members={members}
					disabled={!canWrite}
					className="w-full border-transparent bg-transparent px-2 font-normal hover:border-transparent hover:bg-accent disabled:after:hidden"
					onChange={(assignee) => onUpdate({ assignee })}
				/>
			</div>
			<PropertySelect
				label="Cycle"
				value={issue.cycleId ?? NO_CYCLE}
				disabled={!canWrite}
				onChange={(cycleId) =>
					onUpdate({ cycleId: cycleId === NO_CYCLE ? null : cycleId })
				}
				items={[
					{ label: "No cycle", value: NO_CYCLE },
					...cycles.map((cycle) => ({ label: cycle.name, value: cycle.id })),
				]}
			/>
			<div className="grid grid-cols-[5.5rem_1fr] items-center gap-2">
				<span className="text-muted-foreground">Parent</span>
				<ParentSelect
					value={issue.parentId}
					options={parentOptions}
					disabled={!canWrite}
					className="w-full border-transparent bg-transparent px-2 font-normal hover:border-transparent hover:bg-accent disabled:after:hidden"
					onChange={(parentId) => onUpdate({ parentId })}
				/>
			</div>
			<PropertySelect
				label="Module"
				value={issue.moduleId ?? NO_MODULE}
				disabled={!canWrite}
				onChange={(moduleId) =>
					onUpdate({ moduleId: moduleId === NO_MODULE ? null : moduleId })
				}
				items={[
					{ label: "No module", value: NO_MODULE },
					...modules.map((item) => ({ label: item.name, value: item.id })),
				]}
			/>
			<PersonAndTime
				label="Created"
				name={issue.createdByName}
				time={issue.createdAt}
			/>
			<PersonAndTime
				label="Last changed"
				name={issue.updatedByName}
				time={issue.updatedAt}
			/>
			{canWrite && (
				<AlertDialog pendingAnnouncement="Deleting work item">
					<AlertDialogTrigger
						render={
							<Button
								variant="ghost"
								size="sm"
								className="mt-3 self-start text-destructive hover:text-destructive"
							/>
						}
					>
						Delete work item
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Delete {issue.id}?</AlertDialogTitle>
							<AlertDialogDescription>
								This permanently deletes the work item and its comments. This
								action cannot be undone.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancel</AlertDialogCancel>
							<AlertDialogAction
								variant="destructive"
								// onError already reports the failure.
								action={() => remove({ id: issue.id }).catch(() => {})}
							>
								Delete work item
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			)}
		</div>
	);
}
