import { queryOptions } from "@tanstack/react-query";
import { orpc } from "../orpc";

export const apiTokensQueryOptions = queryOptions({
	queryKey: ["api-tokens"],
	queryFn: () => orpc.apiTokens.find(),
});

export const createApiToken = (input: {
	name: string;
	expiresInDays: 30 | 90 | 365 | null;
}) => orpc.apiTokens.create(input);

export const revokeApiToken = ({ id }: { id: string }) =>
	orpc.apiTokens.revoke({ id });
