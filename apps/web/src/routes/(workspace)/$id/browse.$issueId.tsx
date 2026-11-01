import { Layers02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { IssueActivity } from "#/components/issue/issue-activity";
import { IssueProperties } from "#/components/issue/issue-properties";
import { ProjectHeader } from "#/components/project/project-header";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "#/components/ui/breadcrumb";
import { Textarea } from "#/components/ui/textarea";
import { currentUserQueryOptions } from "#/lib/auth";
import {
	commentsQueryOptions,
	issueActivityQueryOptions,
	issueQueryOptions,
	updateIssue,
} from "#/lib/data/issue";
import {
	projectMembersQueryOptions,
	useProjectAccess,
} from "#/lib/data/project-members";
import { statesQueryOptions } from "#/lib/data/state";
import { toastError } from "#/lib/errors";
import { cn } from "#/lib/utils";

export const Route = createFileRoute("/(workspace)/$id/browse/$issueId")({
	component: RouteComponent,
	loader: async ({ context: { queryClient, user }, params: { issueId } }) => {
		if (user == null) throw redirect({ to: "/signin" });

		const [issue] = await Promise.all([
			queryClient.ensureQueryData(issueQueryOptions({ issueId })),
			queryClient.ensureQueryData(commentsQueryOptions({ issueId })),
			queryClient.ensureQueryData(issueActivityQueryOptions({ issueId })),
			queryClient.ensureQueryData(currentUserQueryOptions),
		]);
		await Promise.all([
			queryClient.ensureQueryData(
				statesQueryOptions({ projectId: issue.projectId }),
			),
			queryClient.ensureQueryData(
				projectMembersQueryOptions({ projectId: issue.projectId }),
			),
		]);
	},
});

// A field that saves when you leave it. It stays uncontrolled so a background
// refetch can't overwrite what someone is typing.
function EditableText({
	value,
	label,
	placeholder,
	className,
	singleLine,
	required,
	onSave,
}: {
	value: string;
	label: string;
	placeholder?: string;
	className?: string;
	singleLine?: boolean;
	required?: boolean;
	onSave: (value: string) => void;
}) {
	const ref = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		if (ref.current && document.activeElement !== ref.current) {
			ref.current.value = value;
		}
	}, [value]);

	return (
		<Textarea
			ref={ref}
			aria-label={label}
			placeholder={placeholder}
			defaultValue={value}
			className={cn(
				"min-h-0 rounded-sm border-transparent bg-transparent px-1 py-0.5 hover:border-input focus-visible:bg-transparent md:text-[length:inherit] dark:bg-transparent",
				className,
			)}
			onBlur={(event) => {
				const next = singleLine
					? event.target.value.trim()
					: event.target.value;
				if (required && !next) {
					event.target.value = value;
					return;
				}
				if (next !== value) onSave(next);
			}}
			onKeyDown={(event) => {
				if (event.key === "Escape") {
					event.currentTarget.value = value;
					event.currentTarget.blur();
				}
				if (
					event.key === "Enter" &&
					(singleLine || event.metaKey || event.ctrlKey)
				) {
					event.preventDefault();
					event.currentTarget.blur();
				}
			}}
		/>
	);
}

function RouteComponent() {
	const { id: workspaceId, issueId } = Route.useParams();
	const queryClient = useQueryClient();

	const { data: issue } = useSuspenseQuery(issueQueryOptions({ issueId }));
	const { data: states } = useSuspenseQuery(
		statesQueryOptions({ projectId: issue.projectId }),
	);
	const { user, members, canWrite, canManage } = useProjectAccess(
		issue.projectId,
	);

	const { mutate: update } = useMutation({
		mutationFn: (changes: {
			title?: string;
			description?: string;
			state?: string;
			assignee?: string | null;
		}) => updateIssue({ id: issue.id, ...changes }),
		onError: (e) => toastError(e, "Couldn't save your change."),
		onSettled: () =>
			Promise.all(
				[
					["issue", issue.id],
					["activity", issue.id],
					["issues", issue.projectId],
					["my-issues"],
				].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
			),
	});

	return (
		<div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
			<ProjectHeader workspaceId={workspaceId} projectId={issue.projectId} />

			<div className="flex h-10 w-full shrink-0 items-center border-b px-4 sm:px-5">
				<Breadcrumb>
					<BreadcrumbList>
						<BreadcrumbItem>
							<BreadcrumbLink
								render={
									<Link
										to="/$id/projects/$projectId"
										params={{ id: workspaceId, projectId: issue.projectId }}
										className="flex items-center gap-1"
									/>
								}
							>
								<HugeiconsIcon icon={Layers02Icon} className="size-4" />
								Work Items
							</BreadcrumbLink>
						</BreadcrumbItem>
						<BreadcrumbSeparator />
						<BreadcrumbItem>
							<BreadcrumbPage>{issue.id}</BreadcrumbPage>
						</BreadcrumbItem>
					</BreadcrumbList>
				</Breadcrumb>
			</div>
			<div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
				<div className="min-w-0 flex-1 space-y-6 px-4 py-5 sm:px-9 lg:overflow-y-auto">
					<div className="space-y-3">
						<div className="text-sm font-medium text-foreground/60">
							{issue.id}
						</div>
						{canWrite ? (
							<>
								<EditableText
									key={`${issue.id}-title`}
									label="Title"
									value={issue.title}
									singleLine
									required
									className="-ml-1 text-xl font-semibold md:text-xl"
									onSave={(title) => update({ title })}
								/>
								<EditableText
									key={`${issue.id}-description`}
									label="Description"
									placeholder="Add a description"
									value={issue.description}
									className="-ml-1 min-h-16 max-w-prose text-sm/relaxed md:text-sm/relaxed"
									onSave={(description) => update({ description })}
								/>
							</>
						) : (
							<>
								<h1 className="text-xl font-semibold [overflow-wrap:anywhere]">
									{issue.title}
								</h1>
								{issue.description ? (
									<p className="max-w-prose text-sm/relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
										{issue.description}
									</p>
								) : (
									<p className="text-sm text-muted-foreground">
										No description.
									</p>
								)}
							</>
						)}
					</div>
					<div className="border-b lg:hidden">
						<IssueProperties
							issue={issue}
							workspaceId={workspaceId}
							states={states}
							members={members}
							canWrite={canWrite}
							onUpdate={update}
						/>
					</div>
					<IssueActivity
						issueId={issue.id}
						userId={user?.id}
						states={states}
						members={members}
						canManage={canManage}
					/>
				</div>
				<aside className="hidden w-80 shrink-0 overflow-y-auto border-l lg:block xl:w-96">
					<IssueProperties
						issue={issue}
						workspaceId={workspaceId}
						states={states}
						members={members}
						canWrite={canWrite}
						onUpdate={update}
					/>
				</aside>
			</div>
		</div>
	);
}
