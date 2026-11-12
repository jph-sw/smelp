import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { usePageTitle } from "#/hooks/use-page-title";
import { currentUserQueryOptions } from "#/lib/auth";
import { orpc } from "#/lib/orpc";

export const Route = createFileRoute("/verify-email/$token")({
	component: RouteComponent,
});

function RouteComponent() {
	usePageTitle("Confirm email");
	const { token } = Route.useParams();
	const queryClient = useQueryClient();

	const { mutate: verify, status } = useMutation({
		mutationFn: () => orpc.auth.verifyEmail({ token }),
		// Refreshes the signed-in person, so the banner is gone when they continue.
		onSettled: () =>
			queryClient.fetchQuery({ ...currentUserQueryOptions, staleTime: 0 }),
	});

	// A link works once, so it's only used one time, even when React runs this twice.
	const started = useRef(false);
	useEffect(() => {
		if (started.current) return;
		started.current = true;
		verify();
	}, [verify]);

	return (
		<div className="flex min-h-dvh w-full items-center justify-center p-4">
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle>
						{status === "success"
							? "Email confirmed"
							: status === "error"
								? "This link didn't work"
								: "Confirming your email"}
					</CardTitle>
					<CardDescription>
						{status === "success"
							? "Thanks, your address is confirmed."
							: status === "error"
								? "It may have expired or already been used. If you already confirmed, just continue. Otherwise sign in and ask for a new link."
								: "One moment."}
					</CardDescription>
				</CardHeader>
				{status !== "pending" && status !== "idle" && (
					<CardContent>
						<Button className="w-full" render={<Link to="/" />}>
							Continue
						</Button>
					</CardContent>
				)}
			</Card>
		</div>
	);
}
