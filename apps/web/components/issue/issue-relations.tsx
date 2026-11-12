import { Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useDebounce } from "#/hooks/use-debounce";
import {
	addIssueRelation,
	issueRelationsQueryOptions,
	removeIssueRelation,
	searchIssuesQueryOptions,
} from "#/lib/data/issue";
import { toastError } from "#/lib/errors";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../ui/select";

type Kind = Parameters<typeof addIssueRelation>[0]["kind"];

const KIND_LABELS: { value: Kind; label: string }[] = [
	{ value: "blocks", label: "Blocks" },
	{ value: "blocked_by", label: "Blocked by" },
	{ value: "relates", label: "Relates to" },
	{ value: "duplicates", label: "Duplicate of" },
	{ value: "duplicated_by", label: "Duplicated by" },
];

function AddRelation({
	issueId,
	workspaceId,
	relatedIds,
	onAdded,
}: {
	issueId: string;
	workspaceId: string;
	/** Items already related to this one: a pair can only have one relation. */
	relatedIds: ReadonlySet<string>;
	onAdded: () => Promise<unknown>;
}) {
	const [kind, setKind] = useState<Kind>("relates");
	const [text, setText] = useState("");
	const query = useDebounce(text, 250).trim();
	const { data: results } = useQuery({
		...searchIssuesQueryOptions({ workspaceId, query }),
		placeholderData: keepPreviousData,
	});

	const { mutate: add, isPending } = useMutation({
		mutationFn: addIssueRelation,
		onSuccess: async () => {
			setText("");
			await onAdded();
		},
		onError: (e) => toastError(e),
	});

	const candidates = (results ?? []).filter(
		(result) =>
			result.id !== issueId &&
			!relatedIds.has(result.id) &&
			!result.projectArchived,
	);

	return (
		<div className="space-y-2">
			<div className="flex gap-2">
				<Select
					items={KIND_LABELS}
					value={kind}
					onValueChange={(next) => next != null && setKind(next as Kind)}
				>
					<SelectTrigger aria-label="Relation type" className="w-40 shrink-0">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{KIND_LABELS.map((item) => (
							<SelectItem key={item.value} value={item.value}>
								{item.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Input
					type="search"
					aria-label="Find a work item to relate"
					placeholder="Search by title or ID"
					value={text}
					onChange={(event) => setText(event.target.value)}
				/>
			</div>
			{query.length >= 2 && results !== undefined && (
				<ul className="max-h-56 overflow-y-auto rounded-md border">
					{candidates.length === 0 ? (
						<li className="p-2 text-sm text-muted-foreground">
							No work items match.
						</li>
					) : (
						candidates.map((result) => (
							<li key={result.id}>
								<button
									type="button"
									disabled={isPending}
									className="flex w-full items-center gap-2 p-2 text-start text-sm transition-colors duration-150 hover:bg-muted disabled:opacity-50"
									onClick={() => add({ issueId, relatedId: result.id, kind })}
								>
									<span
										className="size-2.5 shrink-0 rounded-full ring-1 ring-foreground/20"
										style={{ backgroundColor: result.stateColor }}
										title={result.stateName}
									/>
									<span className="shrink-0 text-muted-foreground">
										{result.id}
									</span>
									<span className="min-w-0 flex-1 truncate">
										{result.title}
									</span>
								</button>
							</li>
						))
					)}
				</ul>
			)}
		</div>
	);
}

export function IssueRelations({
	issueId,
	workspaceId,
	canWrite,
}: {
	issueId: string;
	workspaceId: string;
	/** False for guests and archived projects: relations are listed, not editable. */
	canWrite: boolean;
}) {
	const queryClient = useQueryClient();
	const options = issueRelationsQueryOptions({ issueId });
	const { data: relations } = useSuspenseQuery(options);

	const refresh = () =>
		Promise.all(
			[
				options.queryKey,
				["activity", issueId],
				// The other item shows the relation too.
				["issue-relations"],
			].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
		);

	const { mutate: remove, isPending: isRemoving } = useMutation({
		mutationFn: removeIssueRelation,
		onSuccess: refresh,
		onError: (e) => toastError(e),
	});

	if (relations.length === 0 && !canWrite) return null;

	return (
		<section className="space-y-3" aria-label="Relations">
			<h2 className="text-lg font-semibold">Relations</h2>
			{relations.length > 0 && (
				<ul className="space-y-1">
					{relations.map((relation) => (
						<li
							key={relation.id}
							className="flex items-center gap-2 rounded-md p-1.5 text-sm hover:bg-muted"
						>
							<span className="w-28 shrink-0 text-xs text-muted-foreground">
								{KIND_LABELS.find((k) => k.value === relation.kind)?.label}
							</span>
							<span
								className="size-2.5 shrink-0 rounded-full ring-1 ring-foreground/20"
								style={{ backgroundColor: relation.issue.stateColor }}
								title={relation.issue.stateName}
							/>
							<Link
								to="/$id/browse/$issueId"
								params={{ id: workspaceId, issueId: relation.issue.id }}
								className="flex min-w-0 flex-1 items-baseline gap-2 hover:underline"
							>
								<span className="shrink-0 text-muted-foreground">
									{relation.issue.id}
								</span>
								<span className="truncate">{relation.issue.title}</span>
							</Link>
							{canWrite && (
								<Button
									variant="ghost"
									size="icon-sm"
									aria-label={`Remove relation to ${relation.issue.id}`}
									disabled={isRemoving || relation.issue.projectArchived}
									onClick={() => remove({ issueId, id: relation.id })}
								>
									<HugeiconsIcon icon={Delete02Icon} />
								</Button>
							)}
						</li>
					))}
				</ul>
			)}
			{relations.length === 0 && (
				<p className="text-sm text-muted-foreground">No relations.</p>
			)}
			{canWrite && (
				<AddRelation
					issueId={issueId}
					workspaceId={workspaceId}
					relatedIds={new Set(relations.map((relation) => relation.issue.id))}
					onAdded={refresh}
				/>
			)}
		</section>
	);
}
