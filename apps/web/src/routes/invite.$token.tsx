import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
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
	acceptInvite,
	invitePreviewQueryOptions,
} from "#/lib/data/workspace-invites";
import { toastError } from "#/lib/errors";

export const Route = createFileRoute("/invite/$token")({
	component: RouteComponent,
	loader: ({ context: { queryClient }, params: { token } }) =>
		queryClient.ensureQueryData(invitePreviewQueryOptions({ token })),
});

function RouteComponent() {
	usePageTitle("Invitation");
	const { token } = Route.useParams();
	const navigate = Route.useNavigate();
	const queryClient = useQueryClient();
	const { data: invite } = useSuspenseQuery(
		invitePreviewQueryOptions({ token }),
	);
	const { data: user } = useSuspenseQuery(currentUserQueryOptions);

	const { mutate: accept, isPending } = useMutation({
		mutationFn: acceptInvite,
		onSuccess: async ({ workspaceId }) => {
			await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
			queryClient.removeQueries({ queryKey: ["invite-preview", token] });
			if (workspaceId) {
				navigate({ to: "/$id", params: { id: workspaceId } });
			} else {
				navigate({ to: "/" });
			}
		},
		onError: (e) => toastError(e),
	});

	return (
		<div className="flex min-h-dvh w-full items-center justify-center p-4">
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle className="[overflow-wrap:anywhere]">
						Join {invite.workspaceName}
					</CardTitle>
					<CardDescription>
						You've been invited as {invite.role === "admin" ? "an" : "a"}{" "}
						{invite.role}.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-2">
					{user ? (
						<Button
							className="w-full"
							disabled={isPending}
							onClick={() => accept({ token })}
						>
							Accept invite
						</Button>
					) : (
						<>
							<Button
								className="w-full"
								render={<Link to="/signup" search={{ invite: token }} />}
							>
								Create an account
							</Button>
							<Button
								variant="outline"
								className="w-full"
								render={<Link to="/signin" search={{ invite: token }} />}
							>
								Sign in
							</Button>
						</>
					)}
				</CardContent>
				{user && (
					<CardFooter className="[overflow-wrap:anywhere] text-muted-foreground">
						Signed in as {user.email}
					</CardFooter>
				)}
			</Card>
		</div>
	);
}
