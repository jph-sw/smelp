import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ConfirmButton } from "#/components/confirm-button";
import { CopyLink } from "#/components/copy-link";
import { ArchivedBanner } from "#/components/project/archived-banner";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { usePageTitle } from "#/hooks/use-page-title";
import {
	connectGithubRepo,
	disconnectGithubRepo,
	githubRepoQueryOptions,
	regenerateGithubSecret,
} from "#/lib/data/github";
import {
	projectMembersQueryOptions,
	useProjectAccess,
} from "#/lib/data/project-members";
import { toastError } from "#/lib/errors";

export const Route = createFileRoute(
	"/(workspace)/$id/settings/projects/$projectId/github",
)({
	component: RouteComponent,
	loader: ({ context: { queryClient }, params: { projectId } }) =>
		queryClient.ensureQueryData(projectMembersQueryOptions({ projectId })),
});

function RouteComponent() {
	usePageTitle("GitHub");
	const { projectId } = Route.useParams();
	const { canManage, isArchived } = useProjectAccess(projectId);

	if (!canManage) {
		return (
			<p className="text-sm text-muted-foreground">
				Only project admins can connect GitHub.
			</p>
		);
	}

	return (
		<div className="flex flex-col gap-6">
			<div className="space-y-1">
				<h1 className="text-lg font-medium">GitHub</h1>
				<p className="text-sm text-muted-foreground">
					Branches, commits and pull requests that mention a work item, like{" "}
					{projectId}-1, show on that item.
				</p>
			</div>
			{isArchived && <ArchivedBanner />}
			<GithubConnection projectId={projectId} readOnly={isArchived} />
		</div>
	);
}

function GithubConnection({
	projectId,
	readOnly,
}: {
	projectId: string;
	readOnly: boolean;
}) {
	const queryClient = useQueryClient();
	const options = githubRepoQueryOptions({ projectId });
	const { data: connection } = useSuspenseQuery(options);
	// Only connecting and regenerating return the secret, so it shows until the
	// page is left and is never read back.
	const [secret, setSecret] = useState<string | null>(null);
	const [repo, setRepo] = useState("");

	const refresh = () =>
		queryClient.invalidateQueries({ queryKey: options.queryKey });
	const showSecret = async (result: { secret: string }) => {
		setSecret(result.secret);
		await refresh();
	};

	const connect = useMutation({
		mutationFn: connectGithubRepo,
		onSuccess: async (result) => {
			setRepo("");
			await showSecret(result);
		},
		onError: (e) => toastError(e, "Couldn't connect the repository."),
	});
	const regenerate = useMutation({
		mutationFn: regenerateGithubSecret,
		onSuccess: showSecret,
		onError: (e) => toastError(e, "Couldn't make a new secret."),
	});
	const disconnect = useMutation({
		mutationFn: disconnectGithubRepo,
		onSuccess: async () => {
			setSecret(null);
			await refresh();
		},
		onError: (e) => toastError(e, "Couldn't disconnect the repository."),
	});

	if (!connection) {
		if (readOnly) {
			return (
				<p className="text-sm text-muted-foreground">
					No repository is connected.
				</p>
			);
		}
		return (
			<form
				className="flex flex-wrap items-center gap-2"
				onSubmit={(event) => {
					event.preventDefault();
					if (repo.trim()) connect.mutate({ projectId, repo });
				}}
			>
				<Input
					aria-label="Repository"
					placeholder="owner/name"
					className="min-w-48 flex-1 sm:w-72 sm:flex-none"
					maxLength={300}
					autoComplete="off"
					value={repo}
					onChange={(event) => setRepo(event.target.value)}
				/>
				<Button type="submit" disabled={!repo.trim() || connect.isPending}>
					Connect repository
				</Button>
			</form>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			<p className="text-sm">
				Connected to{" "}
				<a
					href={`https://github.com/${connection.repo}`}
					target="_blank"
					rel="noopener noreferrer"
					className="font-medium underline-offset-3 hover:underline"
				>
					{connection.repo}
				</a>
				.
			</p>
			<CopyLink
				title="Payload URL"
				hint="GitHub sends the repository's events here."
				link={`${window.location.origin}${connection.webhookPath}`}
				copiedMessage="Address copied."
			/>
			{secret && (
				<CopyLink
					title="Secret"
					hint="It won't be shown again, so copy it now."
					link={secret}
					copiedMessage="Secret copied."
				/>
			)}
			<div className="space-y-2 text-sm text-muted-foreground">
				<p>To finish, add a webhook to the repository on GitHub:</p>
				<ol className="list-decimal space-y-1 pl-5">
					<li>Open Settings, then Webhooks, then Add webhook.</li>
					<li>
						Paste the payload URL and the secret, and set the content type to
						application/json.
					</li>
					<li>
						Choose "Let me select individual events" and tick Branch or tag
						creation, Pushes and Pull requests.
					</li>
				</ol>
				{!secret && !readOnly && (
					<p>
						Lost the secret? Make a new one and paste it into the webhook on
						GitHub.
					</p>
				)}
			</div>
			{!readOnly && (
				<div className="flex flex-wrap gap-2">
					<ConfirmButton
						buttonLabel="Regenerate secret"
						title="Make a new secret?"
						description="GitHub's deliveries are refused until you paste the new secret into the webhook."
						confirmLabel="Regenerate secret"
						disabled={regenerate.isPending}
						onConfirm={() => regenerate.mutate({ projectId })}
					/>
					<ConfirmButton
						buttonLabel="Disconnect"
						title={`Disconnect ${connection.repo}?`}
						description="New branches, commits and pull requests stop showing on work items. What is already linked stays."
						confirmLabel="Disconnect"
						disabled={disconnect.isPending}
						onConfirm={() => disconnect.mutate({ projectId })}
					/>
				</div>
			)}
		</div>
	);
}
