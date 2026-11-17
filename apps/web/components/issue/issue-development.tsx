import {
	GitBranchIcon,
	GitCommitIcon,
	GitMergeIcon,
	GitPullRequestClosedIcon,
	GitPullRequestIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { PullRequestState, tables } from "@smelp/db";
import { useSuspenseQuery } from "@tanstack/react-query";
import { githubRefsQueryOptions } from "#/lib/data/github";
import { cn } from "#/lib/utils";

type GithubRef = tables["issue_github_ref"];

const PULL_REQUEST_STATES: Record<
	PullRequestState,
	{ label: string; icon: IconSvgElement; className: string }
> = {
	open: {
		label: "Open",
		icon: GitPullRequestIcon,
		className: "text-green-700 dark:text-green-400",
	},
	merged: {
		label: "Merged",
		icon: GitMergeIcon,
		className: "text-purple-700 dark:text-purple-400",
	},
	closed: {
		label: "Closed",
		icon: GitPullRequestClosedIcon,
		className: "text-red-700 dark:text-red-400",
	},
};

function describe(ref: GithubRef) {
	switch (ref.kind) {
		case "pull_request": {
			const state = PULL_REQUEST_STATES[ref.state];
			return {
				kind: "Pull request",
				icon: state.icon,
				iconClassName: state.className,
				label: `#${ref.ref} ${ref.title ?? ""}`.trim(),
				state,
			};
		}
		case "branch":
			return {
				kind: "Branch",
				icon: GitBranchIcon,
				iconClassName: "text-muted-foreground",
				label: ref.ref,
				state: null,
			};
		case "commit":
			return {
				kind: "Commit",
				icon: GitCommitIcon,
				iconClassName: "text-muted-foreground",
				label: `${ref.ref.slice(0, 7)} ${ref.title ?? ""}`.trim(),
				state: null,
			};
	}
}

export function IssueDevelopment({
	issueId,
	className,
}: {
	issueId: string;
	className?: string;
}) {
	const { data: refs } = useSuspenseQuery(githubRefsQueryOptions({ issueId }));

	// Nothing to add by hand: links arrive from GitHub on their own.
	if (refs.length === 0) return null;

	return (
		<section className={cn("space-y-2", className)} aria-label="Development">
			<h2 className="text-sm font-semibold">Development</h2>
			<ul className="space-y-1">
				{refs.map((ref) => {
					const shown = describe(ref);
					return (
						<li key={ref.id} className="flex items-center gap-2 text-sm">
							<HugeiconsIcon
								icon={shown.icon}
								className={cn("size-4 shrink-0", shown.iconClassName)}
								aria-label={shown.kind}
							/>
							<a
								href={ref.url}
								target="_blank"
								rel="noopener noreferrer"
								title={`${ref.repo}${ref.author ? ` by ${ref.author}` : ""}`}
								className="min-w-0 flex-1 truncate underline-offset-3 hover:underline"
							>
								{shown.label}
							</a>
							{shown.state && (
								<span
									className={cn(
										"shrink-0 text-xs font-medium",
										shown.state.className,
									)}
								>
									{shown.state.label}
								</span>
							)}
						</li>
					);
				})}
			</ul>
		</section>
	);
}
