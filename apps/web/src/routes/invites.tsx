import { ORPCError } from "@orpc/client";
import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { toast } from "#/components/ui/toast";
import {
	acceptInvite,
	myInvitesQueryOptions,
} from "#/lib/data/workspace-invites";

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
		onError: (e) => {
			if (e instanceof ORPCError) {
				toast.add({ type: "error", description: e.message });
			}
		},
	});

	return (
		<div className="w-full h-dvh flex justify-center items-center">
			<Card className="w-xl">
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
									<div className="flex flex-col">
										<span className="text-sm font-medium">
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
			</Card>
		</div>
	);
}
