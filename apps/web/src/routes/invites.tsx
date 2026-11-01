import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	redirect,
	useNavigate,
} from "@tanstack/react-router";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { toast } from "#/components/ui/toast";
import {
	acceptInvite,
	myInvitesQueryOptions,
} from "#/lib/data/workspace-invites";
import { toastError } from "#/lib/errors";

export const Route = createFileRoute("/invites")({
	component: RouteComponent,
	loader: async ({ context: { queryClient, user } }) => {
		if (user == null) {
			throw redirect({ to: "/signin" });
		}

		await queryClient.ensureQueryData(myInvitesQueryOptions);
	},
});

function RouteComponent() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { data: invites } = useSuspenseQuery(myInvitesQueryOptions);

	const { mutate: accept, isPending } = useMutation({
		mutationFn: acceptInvite,
		onSuccess: async (result) => {
			await queryClient.invalidateQueries({
				queryKey: myInvitesQueryOptions.queryKey,
			});
			await queryClient.invalidateQueries({ queryKey: ["workspaces"] });

			if (result.workspaceId) {
				toast.add({ type: "success", description: "Invite accepted." });
				navigate({ to: "/$id", params: { id: result.workspaceId } });
			}
		},
		onError: (e) => toastError(e),
	});

	return (
		<div className="flex h-dvh w-full items-center justify-center p-4">
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>Your invites</CardTitle>
				</CardHeader>
				<CardContent>
					{invites.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							You have no pending invites.
						</p>
					) : (
						<div className="flex flex-col gap-1">
							{invites.map((invite) => (
								<div
									key={invite.id}
									className="flex items-center gap-3 rounded-md px-2 py-2"
								>
									<div className="flex min-w-0 flex-col">
										<span className="text-sm font-medium [overflow-wrap:anywhere]">
											{invite.workspaceName}
										</span>
										<span className="text-xs text-muted-foreground capitalize">
											{invite.role}
										</span>
									</div>
									<Button
										size="sm"
										className="ml-auto"
										disabled={isPending}
										onClick={() => accept({ inviteId: invite.id })}
									>
										Accept
									</Button>
								</div>
							))}
						</div>
					)}
				</CardContent>
				<CardFooter>
					<Link to="/create-workspace" className="underline underline-offset-3">
						Create a workspace instead
					</Link>
				</CardFooter>
			</Card>
		</div>
	);
}
