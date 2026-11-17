import { createHmac, timingSafeEqual } from "node:crypto";
import type { PullRequestState, tables } from "@smelp/db";
import * as v from "valibot";

// What GitHub sends, read without HTTP or the database. A delivery becomes the
// branches, commits and pull requests it describes, each with the text to search
// for work item keys.

export type GithubRef = Pick<
	tables["issue_github_ref"],
	"ref" | "title" | "url" | "author"
> &
	(
		| { kind: "branch" | "commit"; state: null }
		| { kind: "pull_request"; state: PullRequestState }
	) & { text: string };

export type Delivery = {
	/** owner/name, as GitHub spells it. */
	repo: string;
	/** Who did it on GitHub. */
	sender: string | null;
	refs: GithubRef[];
};

const TITLE_LENGTH = 300;

const WebUrl = v.pipe(v.string(), v.url(), v.startsWith("https://"));
const Login = v.object({ login: v.string() });
const Repository = v.object({ full_name: v.string(), html_url: WebUrl });
const Sender = v.optional(v.nullable(Login), null);

const Push = v.object({
	ref: v.string(),
	deleted: v.optional(v.boolean(), false),
	repository: Repository,
	sender: Sender,
	commits: v.optional(
		v.array(
			v.object({
				id: v.string(),
				message: v.string(),
				url: WebUrl,
				author: v.optional(
					v.object({
						name: v.optional(v.string()),
						username: v.optional(v.string()),
					}),
				),
			}),
		),
		[],
	),
});

const Create = v.object({
	ref: v.string(),
	ref_type: v.string(),
	repository: Repository,
	sender: Sender,
});

const PULL_REQUEST_ACTIONS = [
	"opened",
	"edited",
	"reopened",
	"closed",
	"synchronize",
] as const;

const PullRequest = v.object({
	action: v.string(),
	repository: Repository,
	sender: Sender,
	pull_request: v.object({
		number: v.pipe(v.number(), v.integer()),
		title: v.string(),
		body: v.optional(v.nullable(v.string()), null),
		html_url: WebUrl,
		state: v.picklist(["open", "closed"]),
		merged_at: v.optional(v.nullable(v.string()), null),
		user: v.optional(v.nullable(Login), null),
		head: v.object({ ref: v.string() }),
	}),
});

const firstLine = (text: string) =>
	(text.split("\n")[0] ?? "").trim().slice(0, TITLE_LENGTH);

const branchUrl = (repositoryUrl: string, branch: string) =>
	`${repositoryUrl}/tree/${branch.split("/").map(encodeURIComponent).join("/")}`;

function branchRef(
	repositoryUrl: string,
	branch: string,
	author: string | null,
): GithubRef {
	return {
		kind: "branch",
		ref: branch,
		title: null,
		url: branchUrl(repositoryUrl, branch),
		state: null,
		author,
		text: branch,
	};
}

type Parser = (payload: unknown) => Delivery | null;

const PARSERS: Record<string, Parser> = {
	push(payload) {
		const parsed = v.safeParse(Push, payload);
		if (!parsed.success) return null;
		const { ref, deleted, repository, sender, commits } = parsed.output;
		const login = sender?.login ?? null;
		const branch = ref.startsWith("refs/heads/")
			? ref.slice("refs/heads/".length)
			: null;

		const refs: GithubRef[] = commits.map((commit) => ({
			kind: "commit",
			ref: commit.id,
			title: firstLine(commit.message),
			url: commit.url,
			state: null,
			author: commit.author?.username ?? commit.author?.name ?? null,
			text: commit.message,
		}));
		if (branch && !deleted) {
			refs.push(branchRef(repository.html_url, branch, login));
		}
		return { repo: repository.full_name, sender: login, refs };
	},

	create(payload) {
		const parsed = v.safeParse(Create, payload);
		if (!parsed.success || parsed.output.ref_type !== "branch") return null;
		const { ref, repository, sender } = parsed.output;
		const login = sender?.login ?? null;
		return {
			repo: repository.full_name,
			sender: login,
			refs: [branchRef(repository.html_url, ref, login)],
		};
	},

	pull_request(payload) {
		const parsed = v.safeParse(PullRequest, payload);
		if (!parsed.success) return null;
		const { action, repository, sender, pull_request: pr } = parsed.output;
		if (!(PULL_REQUEST_ACTIONS as readonly string[]).includes(action)) {
			return null;
		}
		const state: PullRequestState = pr.merged_at !== null ? "merged" : pr.state;
		return {
			repo: repository.full_name,
			sender: sender?.login ?? null,
			refs: [
				{
					kind: "pull_request",
					ref: String(pr.number),
					title: pr.title.slice(0, TITLE_LENGTH),
					url: pr.html_url,
					state,
					author: pr.user?.login ?? null,
					text: [pr.title, pr.body ?? "", pr.head.ref].join("\n"),
				},
			],
		};
	},
};

/** Null for an event this doesn't follow, or a payload of the wrong shape. */
export function parseDelivery(event: string, payload: unknown) {
	return PARSERS[event]?.(payload) ?? null;
}

export function signatureMatches(
	secret: string,
	body: Uint8Array,
	header: string | null,
) {
	const prefix = "sha256=";
	if (!header?.startsWith(prefix)) return false;
	const expected = createHmac("sha256", secret).update(body).digest();
	const given = Buffer.from(header.slice(prefix.length), "hex");
	return given.length === expected.length && timingSafeEqual(given, expected);
}

const escapeRegExp = (text: string) =>
	text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The project's work item ids that the text mentions, in any case. A key inside
 * a longer word or number ("XSMELP-1", "SMELP-10") doesn't count as SMELP-1.
 */
export function issueKeys(text: string, projectId: string) {
	const pattern = new RegExp(
		`(?<![A-Za-z0-9])${escapeRegExp(projectId)}-(\\d+)(?![A-Za-z0-9])`,
		"gi",
	);
	const keys = Array.from(
		text.matchAll(pattern),
		(match) => `${projectId}-${match[1]}`,
	);
	return [...new Set(keys)];
}

export type PullRequestMilestone = "linked" | "merged";

/**
 * Whether a ref reaching an item belongs in the item's history: only a pull
 * request's first link and its merge do. `previous` is the state stored before,
 * undefined when the item had no such ref yet.
 */
export function pullRequestMilestones(
	ref: GithubRef,
	previous: PullRequestState | null | undefined,
): PullRequestMilestone[] {
	if (ref.kind !== "pull_request") return [];
	const milestones: PullRequestMilestone[] = [];
	if (previous === undefined) milestones.push("linked");
	if (ref.state === "merged" && previous !== "merged") {
		milestones.push("merged");
	}
	return milestones;
}
