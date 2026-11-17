import { queryOptions } from "@tanstack/react-query";
import { orpc } from "../orpc";

export type AuthorizationParams = Parameters<typeof orpc.oauth.describe>[0];

export const authorizationQueryOptions = (params: AuthorizationParams) =>
	queryOptions({
		queryKey: ["oauth-authorization", params],
		queryFn: () => orpc.oauth.describe(params),
		staleTime: 0,
	});

export const approveAuthorization = (params: AuthorizationParams) =>
	orpc.oauth.approve(params);
