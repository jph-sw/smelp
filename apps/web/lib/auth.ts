import type { tables } from "@smelp/db";
import { type QueryClient, queryOptions } from "@tanstack/react-query";
import { orpc } from "./orpc";

export type AuthUser = tables["auth_user"] & {
	/** Their address isn't confirmed yet and the server can email a link. */
	emailVerificationPending: boolean;
};

export async function signIn(email: string, password: string) {
	const res = await orpc.auth.signIn({ email, password });

	return res.user;
}

export async function signUp(
	email: string,
	fullName: string,
	displayName: string,
	password: string,
	inviteToken?: string,
) {
	const res = await orpc.auth.signUp({
		email,
		fullName,
		displayName,
		password,
		inviteToken,
	});

	return res.user;
}

export async function signOut() {
	await orpc.auth.signOut();
}

export async function getCurrentUser(): Promise<AuthUser | null> {
	const { user } = await orpc.auth.session();
	return user;
}

export const currentUserQueryOptions = queryOptions({
	queryKey: ["auth", "me"],
	queryFn: getCurrentUser,
});

// Call after sign-in/sign-up, before navigating: drops anything cached for a
// previous user and loads the new one.
export async function startSession(queryClient: QueryClient) {
	queryClient.clear();
	await queryClient.fetchQuery(currentUserQueryOptions);
}

// Call after sign-out. Other queries are only dropped once navigation finishes,
// since mounted routes would refetch them without a session.
export async function endSession(
	queryClient: QueryClient,
	redirectToSignIn: () => Promise<void>,
) {
	queryClient.setQueryData(currentUserQueryOptions.queryKey, null);
	await redirectToSignIn();
	queryClient.removeQueries({
		predicate: (query) => query.queryKey[0] !== "auth",
	});
}
