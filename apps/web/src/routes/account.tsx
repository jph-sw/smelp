import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
import { ApiTokensCard } from "#/components/account/api-tokens-card";
import { NotificationsCard } from "#/components/account/notifications-card";
import {
	ChangePasswordCard,
	SetPasswordCard,
} from "#/components/account/password-cards";
import { ProfileCard } from "#/components/account/profile-card";
import { SignInMethodsCard } from "#/components/account/sign-in-methods-card";
import { toast } from "#/components/ui/toast";
import { usePageTitle } from "#/hooks/use-page-title";
import { currentUserQueryOptions } from "#/lib/auth";
import {
	linkedAccountsQueryOptions,
	OIDC_LINK_MESSAGES,
} from "#/lib/data/sign-in-options";

export const Route = createFileRoute("/account")({
	validateSearch: (search: Record<string, unknown>): { oidc?: string } => ({
		oidc: typeof search.oidc === "string" ? search.oidc : undefined,
	}),
	component: RouteComponent,
	beforeLoad: ({ context }) => {
		if (context.user == null) throw redirect({ to: "/signin" });
	},
});

function RouteComponent() {
	usePageTitle("Account");
	const { data: user } = useSuspenseQuery(currentUserQueryOptions);
	const { data: accounts } = useQuery(linkedAccountsQueryOptions);
	const { oidc } = Route.useSearch();
	const navigate = Route.useNavigate();

	// Where linking a provider ends up. Said once, then taken out of the address.
	useEffect(() => {
		if (!oidc) return;
		toast({
			type: oidc === "linked" ? "success" : "error",
			description: Object.hasOwn(OIDC_LINK_MESSAGES, oidc)
				? OIDC_LINK_MESSAGES[oidc]
				: OIDC_LINK_MESSAGES.failed,
		});
		navigate({ search: {}, replace: true });
	}, [oidc, navigate]);

	return (
		<div className="mx-auto w-full max-w-4xl space-y-10 p-4 sm:p-8">
			<div className="flex items-baseline justify-between gap-4">
				<div className="min-w-0 space-y-1">
					<h1 className="text-xl font-medium">Account</h1>
					<p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
						Signed in as {user?.email}
					</p>
				</div>
				<Link to="/" className="shrink-0 underline underline-offset-3">
					Back to smelp
				</Link>
			</div>
			{user && <ProfileCard user={user} />}
			{user && <NotificationsCard user={user} />}
			{accounts && (accounts.providers.length > 0 || accounts.linkable) && (
				<SignInMethodsCard accounts={accounts} />
			)}
			{accounts?.hasPassword === false && <SetPasswordCard />}
			{/* Someone who only signs in through a provider has no password to change. */}
			{accounts?.hasPassword !== false && <ChangePasswordCard />}
			<ApiTokensCard />
		</div>
	);
}
