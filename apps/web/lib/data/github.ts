import { queryOptions } from "@tanstack/react-query";
import { orpc } from "../orpc";

export const githubRepoQueryOptions = ({ projectId }: { projectId: string }) =>
	queryOptions({
		queryKey: ["github-repo", projectId],
		queryFn: () => orpc.githubRepo.find({ projectId }),
	});

export const githubRefsQueryOptions = ({ issueId }: { issueId: string }) =>
	queryOptions({
		queryKey: ["github-refs", issueId],
		queryFn: () => orpc.githubRefs.find({ issueId }),
	});

export const connectGithubRepo = (input: { projectId: string; repo: string }) =>
	orpc.githubRepo.connect(input);

export const regenerateGithubSecret = (input: { projectId: string }) =>
	orpc.githubRepo.regenerateSecret(input);

export const disconnectGithubRepo = (input: { projectId: string }) =>
	orpc.githubRepo.disconnect(input);
