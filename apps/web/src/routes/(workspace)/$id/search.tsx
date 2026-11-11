import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Input } from "#/components/ui/input";
import { Spinner } from "#/components/ui/spinner";
import { useDebounce } from "#/hooks/use-debounce";
import { usePageTitle } from "#/hooks/use-page-title";
import { searchIssuesQueryOptions } from "#/lib/data/issue";
import { initials } from "#/lib/utils";

// Matches the server's cap, so a full page of results means there may be more.
const RESULT_LIMIT = 50;

export const Route = createFileRoute("/(workspace)/$id/search")({
	component: RouteComponent,
	validateSearch: (search: Record<string, unknown>): { q?: string } => ({
		q:
			typeof search.q === "string" || typeof search.q === "number"
				? String(search.q)
				: undefined,
	}),
});

function RouteComponent() {
	const { id: workspaceId } = Route.useParams();
	const { q = "" } = Route.useSearch();
	const navigate = Route.useNavigate();
	usePageTitle(q ? `Search: ${q}` : "Search");

	const [text, setText] = useState(q);
	const debouncedText = useDebounce(text, 250);

	// biome-ignore lint/correctness/useExhaustiveDependencies: only typing should write to the URL
	useEffect(() => {
		const next = debouncedText.trim() || undefined;
		if (next !== (q || undefined)) {
			navigate({ search: { q: next }, replace: true });
		}
	}, [debouncedText]);

	// Follows the URL when it changes elsewhere, such as browser back.
	// biome-ignore lint/correctness/useExhaustiveDependencies: the input's own value must not reset it
	useEffect(() => {
		if (q !== text.trim()) setText(q);
	}, [q]);

	const query = q.trim();
	const { data: results, isFetching } = useQuery({
		...searchIssuesQueryOptions({ workspaceId, query }),
		placeholderData: keepPreviousData,
	});
	const tooShort = query.length < 2;

	return (
		<div className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-8">
			<h1 className="text-xl font-medium">Search</h1>
			<div className="relative">
				<Input
					type="search"
					aria-label="Search work items"
					placeholder="Search by title or ID, like WEB-12"
					className="h-9 pe-8 text-sm"
					autoFocus
					value={text}
					onChange={(event) => setText(event.target.value)}
				/>
				{isFetching && !tooShort && (
					<Spinner className="absolute end-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
				)}
			</div>
			<section className="space-y-1" aria-label="Results" aria-live="polite">
				{tooShort ? (
					<p className="p-2 text-sm text-muted-foreground">
						Type at least two characters to search work items in every project
						you're in.
					</p>
				) : results === undefined ? null : results.length === 0 ? (
					<p className="p-2 text-sm text-muted-foreground">
						No work items match “{query}”.
					</p>
				) : (
					<>
						{results.map((issue) => (
							<Link
								key={issue.id}
								to="/$id/browse/$issueId"
								params={{ id: workspaceId, issueId: issue.id }}
								className="flex items-center gap-3 rounded-md p-2 transition-colors duration-150 hover:bg-muted"
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
							</Link>
						))}
						{results.length >= RESULT_LIMIT && (
							<p className="p-2 text-xs text-muted-foreground">
								Showing the {RESULT_LIMIT} most recently updated matches. A
								longer search narrows it down.
							</p>
						)}
					</>
				)}
			</section>
		</div>
	);
}
