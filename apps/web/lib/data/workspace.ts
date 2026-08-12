import type { tables } from "@smelp/db";
import { queryOptions } from "@tanstack/react-query";
import { ApiError } from "../utils";

export const workspacesQueryOptions = ({ userId }: { userId: string }) =>
	queryOptions({
		queryKey: ["workspaces", userId],
		queryFn: async () => {
			const res = await fetch(`/api/workspaces?userId=${userId}`);

			if (!res.ok) {
				const body = await res.json().catch(() => null);
				throw new ApiError(res.status, body);
			}

			return (await res.json()) as tables["workspace"][];
		},
	});

export const workspaceQueryOptions = ({
	workspaceId,
}: {
	workspaceId: string;
}) =>
	queryOptions({
		queryKey: ["workspace", workspaceId],
		queryFn: async () => {
			const res = await fetch(`/api/workspace?workspaceId=${workspaceId}`);

			if (!res.ok) {
				const body = await res.json().catch(() => null);
				throw new ApiError(res.status, body);
			}

			return (await res.json()) as tables["workspace"];
		},
	});
