import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { usePageTitle } from "#/hooks/use-page-title";
import { currentUserQueryOptions } from "#/lib/auth";
import {
	type AuthorizationParams,
	approveAuthorization,
	authorizationQueryOptions,
} from "#/lib/data/oauth";
import { toastError } from "#/lib/errors";

const PARAMS = [
	"response_type",
	"client_id",
	"redirect_uri",
	"code_challenge",
	"code_challenge_method",
	"state",
	"resource",
	"scope",
] as const;

export const Route = createFileRoute("/oauth/authorize")({
	validateSearch: (search: Record<string, unknown>): AuthorizationParams =>
		Object.fromEntries(
			PARAMS.flatMap((name) =>
				typeof search[name] === "string" ? [[name, search[name]]] : [],
			),
		),
	beforeLoad: ({ context, location }) => {
		if (context.user == null) {
			throw redirect({ to: "/signin", search: { redirect: location.href } });
		}
	},
	loaderDeps: ({ search }) => search,
	loader: ({ context: { queryClient }, deps }) =>
		queryClient.ensureQueryData(authorizationQueryOptions(deps)),
	component: Authorize,
});

function Authorize() {
	usePageTitle("Allow access");
	const params = Route.useSearch();
	const { data: request } = useSuspenseQuery(authorizationQueryOptions(params));
	const { data: user } = useSuspenseQuery(currentUserQueryOptions);
	const [left, setLeft] = useState(false);

	// An app's own scheme opens the app and leaves this tab open, so say what happened.
	const leave = (url: string) => {
		setLeft(true);
		window.location.assign(url);
	};

	const { mutate: allow, isPending } = useMutation({
		mutationFn: approveAuthorization,
		onSuccess: ({ redirectTo }) => leave(redirectTo),
		onError: (e) => toastError(e),
	});

	useEffect(() => {
		if (request.kind === "redirect")
			window.location.replace(request.redirectTo);
	}, [request]);

	if (request.kind === "invalid") {
		return (
			<Page>
				<CardHeader>
					<CardTitle>This sign-in link doesn't work</CardTitle>
					<CardDescription>{request.message}</CardDescription>
				</CardHeader>
				<CardContent>
					<Button variant="outline" className="w-full" render={<Link to="/" />}>
						Go to smelp
					</Button>
				</CardContent>
			</Page>
		);
	}

	if (request.kind === "redirect" || left) {
		return (
			<Page>
				<CardHeader>
					<CardTitle>Returning to the app</CardTitle>
					<CardDescription>
						If nothing happens, go back to the app. You can close this tab.
					</CardDescription>
				</CardHeader>
			</Page>
		);
	}

	return (
		<Page>
			<CardHeader>
				<CardTitle className="[overflow-wrap:anywhere]">
					Allow {request.clientName} to work in smelp as you?
				</CardTitle>
				<CardDescription>
					It can read and change everything you can. You can revoke it any time
					under API tokens on your{" "}
					<Link to="/account" className="underline underline-offset-3">
						account page
					</Link>
					.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-2">
				<p className="text-sm [overflow-wrap:anywhere]">
					You'll go back to <strong>{request.destination}</strong>.
				</p>
				<Button
					className="w-full"
					disabled={isPending}
					onClick={() => allow(params)}
				>
					Allow
				</Button>
				<Button
					variant="outline"
					className="w-full"
					disabled={isPending}
					onClick={() => leave(request.denyUrl)}
				>
					Deny
				</Button>
			</CardContent>
			{user && (
				<CardFooter className="[overflow-wrap:anywhere] text-muted-foreground">
					Signed in as {user.email}
				</CardFooter>
			)}
		</Page>
	);
}

function Page({ children }: { children: ReactNode }) {
	return (
		<div className="flex min-h-dvh w-full items-center justify-center p-4">
			<Card className="w-full max-w-sm">{children}</Card>
		</div>
	);
}
