import type { tables } from "@smelp/db";
import { queryOptions } from "@tanstack/react-query";

export const workspacesQueryOptions = ({ userId }: { userId: string }) =>
	queryOptions({
		queryKey: ["", userId],
		queryFn: async () => {
			const res = await fetch(`/api/workspaces?userId=${userId}`);
			const body = (await res.json()) as tables["workspace"][];
			return body;
		},
	});
