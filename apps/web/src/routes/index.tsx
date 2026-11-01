import { createFileRoute, redirect } from "@tanstack/react-router";
import { workspacesQueryOptions } from "#/lib/data/workspace";
import { myInvitesQueryOptions } from "#/lib/data/workspace-invites";

export const Route = createFileRoute("/")({
	loader: async ({ context: { queryClient, user } }) => {
		if (user == null) {
			throw redirect({ to: "/signin" });
		}

		const workspaces = await queryClient.ensureQueryData(
			workspacesQueryOptions({ userId: user.id }),
		);

		if (workspaces.length > 0) {
			throw redirect({ to: "/$id", params: { id: workspaces[0].id } });
		}

		const invites = await queryClient.ensureQueryData(myInvitesQueryOptions);
		throw redirect({
			to: invites.length > 0 ? "/invites" : "/create-workspace",
		});
	},
});
