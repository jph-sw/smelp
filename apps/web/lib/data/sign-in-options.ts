import { queryOptions } from "@tanstack/react-query";
import { orpc } from "../orpc";

export const signInOptionsQueryOptions = queryOptions({
	queryKey: ["sign-in-options"],
	queryFn: () => orpc.auth.signInOptions(),
});

export const linkedAccountsQueryOptions = queryOptions({
	queryKey: ["linked-accounts"],
	queryFn: () => orpc.auth.linkedAccounts(),
});

export const unlinkOidc = () => orpc.auth.unlinkOidc();

export const setPassword = (newPassword: string) =>
	orpc.auth.setPassword({ newPassword });

// What the sign-in page says when a single sign-on attempt ends without a session.
// The server only sends these codes, never text.
export const OIDC_ERROR_MESSAGES: Record<string, string> = {
	cancelled: "Sign-in was cancelled.",
	email_unverified:
		"Your provider hasn't verified your email address, so it can't be used to sign in here.",
	signup_closed:
		"There's no account for you here, and sign-ups are closed. Ask a workspace admin for an invite link.",
	no_match:
		"We couldn't match this sign-in to one account. Ask an instance admin for help.",
	rate_limited: "Too many attempts. Try again in a few minutes.",
	unavailable: "The sign-in provider can't be reached right now.",
	failed: "Sign-in didn't work. Please try again.",
};

export const oidcStartUrl = (invite?: string) =>
	invite
		? `/api/auth/oidc/start?invite=${encodeURIComponent(invite)}`
		: "/api/auth/oidc/start";
