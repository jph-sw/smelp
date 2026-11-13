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

export const startOidcLink = () => orpc.auth.startOidcLink();

export const setPassword = (newPassword: string) =>
	orpc.auth.setPassword({ newPassword });

// What the sign-in page says when a single sign-on attempt ends without a session.
// The server only sends these codes, never text.
export const OIDC_ERROR_MESSAGES: Record<string, string> = {
	cancelled: "Sign-in was cancelled.",
	email_unverified:
		"Your provider hasn't verified your email address, so it can't be used to sign in here.",
	// One message for every case where a sign-in has no account, so it doesn't say
	// whether an account with that email exists.
	not_linked:
		"No account is linked to this sign-in. If you already have an account, sign in with your password and link it under Account, Single sign-on. Otherwise, ask a workspace admin for an invite link.",
	session_ended:
		"You were signed out before linking finished. Sign in and try again.",
	rate_limited: "Too many attempts. Try again in a few minutes.",
	unavailable: "The sign-in provider can't be reached right now.",
	failed: "Sign-in didn't work. Please try again.",
};

// What account settings says when linking a provider ends.
export const OIDC_LINK_MESSAGES: Record<string, string> = {
	linked: "Provider linked.",
	identity_taken: "That sign-in is already linked to another account.",
	already_linked: "Your account is already linked to this provider.",
	cancelled: "Linking was cancelled.",
	failed: "Linking didn't work. Please try again.",
};

export const oidcStartUrl = (invite?: string) =>
	invite
		? `/api/auth/oidc/start?invite=${encodeURIComponent(invite)}`
		: "/api/auth/oidc/start";
