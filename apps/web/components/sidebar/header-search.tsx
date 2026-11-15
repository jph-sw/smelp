import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	Autocomplete,
	AutocompleteContent,
	AutocompleteEmpty,
	AutocompleteInput,
	AutocompleteItem,
	AutocompleteList,
	AutocompleteStatus,
} from "@ui-sdk/react/autocomplete";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { useDebounce } from "#/hooks/use-debounce";
import { searchIssuesQueryOptions } from "#/lib/data/issue";
import { initials } from "#/lib/utils";

// Matches the server's cap, so a full page of results means there may be more.
const RESULT_LIMIT = 50;

export function HeaderSearch({ workspaceId }: { workspaceId: string }) {
	const [text, setText] = useState("");
	const query = useDebounce(text, 250).trim();
	const tooShort = query.length < 2;
	const { data, isFetching, isError } = useQuery({
		...searchIssuesQueryOptions({ workspaceId, query }),
		placeholderData: keepPreviousData,
	});
	const results = tooShort ? [] : (data ?? []);

	return (
		<div role="search" className="relative w-full min-w-0">
			<Autocomplete
				value={text}
				onValueChange={(value, details) =>
					setText(details.reason === "item-press" ? "" : value)
				}
				filter={false}
				status={isError ? "error" : isFetching ? "loading" : "idle"}
			>
				<HugeiconsIcon
					icon={Search01Icon}
					aria-hidden
					className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
				/>
				<AutocompleteInput
					type="search"
					aria-label="Search work items"
					placeholder="Search work items"
					className="h-8 w-full ps-8 text-sm"
				/>
				<AutocompleteContent className="w-(--anchor-width) min-w-80">
					<AutocompleteStatus>
						{(state) =>
							state.status === "error"
								? "Search failed. Try again."
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
							state.empty && !tooShort && !state.loading && !isError
								? `No work items match “${query}”.`
								: null
						}
					</AutocompleteEmpty>
					<AutocompleteList className="max-h-[min(28rem,70dvh)] overflow-y-auto">
						{results.map((issue) => (
							<AutocompleteItem
								key={issue.id}
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
										<AvatarImage
											src={issue.assigneeImage ?? undefined}
											alt=""
										/>
										<AvatarFallback>
											{initials(issue.assigneeName)}
										</AvatarFallback>
									</Avatar>
								)}
							</AutocompleteItem>
						))}
					</AutocompleteList>
				</AutocompleteContent>
			</Autocomplete>
		</div>
	);
}
