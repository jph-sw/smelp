export type project_github_repo = {
	id: string;
	projectId: string;
	/** owner/name */
	repo: string;
	secret: string;
	createdBy: string | null;
	createdAt: number;
};

export type PullRequestState = "open" | "merged" | "closed";

export type issue_github_ref = {
	id: string;
	issueId: string;
	repo: string;
	/** The branch name, the commit sha or the pull request number. */
	ref: string;
	title: string | null;
	url: string;
	author: string | null;
	createdAt: number;
	updatedAt: number;
} & (
	| { kind: "branch" | "commit"; state: null }
	| { kind: "pull_request"; state: PullRequestState }
);
