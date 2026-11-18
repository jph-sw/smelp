import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	Autocomplete,
	AutocompleteContent,
	AutocompleteEmpty,
	AutocompleteGroup,
	AutocompleteGroupLabel,
	AutocompleteInput,
	AutocompleteItem,
	AutocompleteList,
	AutocompleteStatus,
} from "@ui-sdk/react/autocomplete";
import { useShortcut, useShortcutHint } from "@ui-sdk/react/shortcuts";
import { useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { useDebounce } from "#/hooks/use-debounce";
import {
	recentIssuesQueryOptions,
	searchIssuesQueryOptions,
} from "#/lib/data/issue";
import { readRecentIssues } from "#/lib/recent-issues";
import { initials } from "#/lib/utils";
import { useWorkspaceViewer } from "#/lib/workspace-viewer";

// Matches the server's cap, so a full page of results means there may be more.
const RESULT_LIMIT = 50;

type IssueResult = Awaited<
	ReturnType<
		NonNullable<ReturnType<typeof searchIssuesQueryOptions>["queryFn"]>
	>
>[number];

function IssueOption({
	issue,
	workspaceId,
}: {
	issue: IssueResult;
	workspaceId: string;
}) {
	return (
		<AutocompleteItem
			value={issue.id}
			label={issue.title}
			render={
				<Link
					to="/$id/browse/$issueId"
					params={{ id: workspaceId, issueId: issue.id }}
				/>
			}
			className="flex items-center gap-3"
		>
			<span
				className="size-3 shrink-0 rounded-full ring-1 ring-foreground/20"
				style={{ backgroundColor: issue.stateColor }}
				title={issue.stateName}
			/>
			<span className="min-w-0 flex-1">
				<span className="block truncate text-sm font-medium">
					{issue.title}
				</span>
				<span className="block truncate text-xs text-muted-foreground">
					{issue.id} in {issue.projectName}, {issue.stateName}
					{issue.projectArchived && " · Archived"}
				</span>
			</span>
			{issue.assigneeName && (
				<Avatar size="sm" title={`Assigned to ${issue.assigneeName}`}>
					<AvatarImage src={issue.assigneeImage ?? undefined} alt="" />
					<AvatarFallback>{initials(issue.assigneeName)}</AvatarFallback>
				</Avatar>
			)}
		</AutocompleteItem>
	);
}

export function HeaderSearch({ workspaceId }: { workspaceId: string }) {
	const userId = useWorkspaceViewer().user?.id;
	const [text, setText] = useState("");
	const [open, setOpen] = useState(false);
	const [recentIds, setRecentIds] = useState<string[]>([]);
	const inputRef = useRef<HTMLInputElement>(null);
	const focusSearch = () => inputRef.current?.focus();
	useShortcut("/", focusSearch, { description: "Search work items" });
	// On layouts like German QWERTZ "/" is Shift+7, and ui-sdk only matches "/"
	// without Shift. US Shift+/ reports "?", so this doesn't fire there.
	useShortcut("shift+/", focusSearch);
	const hint = useShortcutHint("/");
	const query = useDebounce(text, 250).trim();
	// Checks the typed text too, so clearing the box doesn't wait for the debounce.
	const tooShort = query.length < 2 || text.trim().length < 2;
	const showRecent = text.trim() === "";
	const { data, isFetching, isError } = useQuery({
		...searchIssuesQueryOptions({ workspaceId, query }),
		placeholderData: keepPreviousData,
	});
	const results = tooShort ? [] : (data ?? []);
	const recent = useQuery(
		recentIssuesQueryOptions({
			workspaceId,
			ids: recentIds,
			enabled: open && showRecent,
		}),
	);
	const recentIssues = showRecent ? (recent.data ?? []) : [];
	const searchFailed = !tooShort && isError;

	return (
		<div role="search" className="relative w-full min-w-0">
			<Autocomplete
				value={text}
				onValueChange={(value, details) => {
					const chosen = details.reason === "item-press";
					setText(chosen ? "" : value);
					// Left focused, the box would take the next "/" as text.
					if (chosen) inputRef.current?.blur();
				}}
				open={open}
				onOpenChange={(next) => {
					if (next) setRecentIds(readRecentIssues(userId, workspaceId));
					setOpen(next);
				}}
				openOnFocus
				filter={false}
				status={
					searchFailed ? "error" : !tooShort && isFetching ? "loading" : "idle"
				}
			>
				<HugeiconsIcon
					icon={Search01Icon}
					aria-hidden
					className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
				/>
				<AutocompleteInput
					ref={inputRef}
					type="search"
					aria-label="Search work items"
					aria-keyshortcuts={hint.ariaKeyshortcuts}
					placeholder="Search work items"
					className="peer h-8 w-full ps-8 text-sm md:pe-8"
				/>
				{text === "" && (
					<kbd
						aria-hidden
						className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 peer-focus:hidden max-md:hidden"
					>
						{hint.text}
					</kbd>
				)}
				<AutocompleteContent className="w-(--anchor-width) min-w-80">
					<AutocompleteStatus>
						{(state) =>
							state.status === "error"
								? "Search failed. Try again."
								: recentIssues.length > 0 || (showRecent && recent.isLoading)
									? ""
									: tooShort
										? "Type at least two characters, or an ID like WEB-12."
										: state.loading
											? "Searching…"
											: results.length >= RESULT_LIMIT
												? `The ${RESULT_LIMIT} most recently updated matches. A longer search narrows it down.`
												: ""
						}
					</AutocompleteStatus>
					<AutocompleteEmpty>
						{(state) =>
							state.empty && !tooShort && !state.loading && !searchFailed
								? `No work items match “${query}”.`
								: null
						}
					</AutocompleteEmpty>
					<AutocompleteList className="max-h-[min(28rem,70dvh)] overflow-y-auto">
						{recentIssues.length > 0 && (
							<AutocompleteGroup>
								<AutocompleteGroupLabel>Recent</AutocompleteGroupLabel>
								{recentIssues.map((issue) => (
									<IssueOption
										key={issue.id}
										issue={issue}
										workspaceId={workspaceId}
									/>
								))}
							</AutocompleteGroup>
						)}
						{results.map((issue) => (
							<IssueOption
								key={issue.id}
								issue={issue}
								workspaceId={workspaceId}
							/>
						))}
					</AutocompleteList>
				</AutocompleteContent>
			</Autocomplete>
		</div>
	);
}
