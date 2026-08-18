import { queryOptions } from "@tanstack/react-query";
import { orpc } from "../orpc";

export const workspaceInvitesQueryOptions = ({
	workspaceId,
}: {
	workspaceId: string;
}) =>
	queryOptions({
		queryKey: ["workspace-invites", workspaceId],
		queryFn: async () => {
			const invites = await orpc.workspaceInvites.find({ workspaceId });
			return invites;
		},
	});

export const createInvite = ({
	workspaceId,
	email,
	role,
}: {
	workspaceId: string;
	email: string;
	role: "guest" | "member" | "admin";
}) => orpc.workspaceInvites.create({ workspaceId, email, role });

export const cancelInvite = ({ inviteId }: { inviteId: string }) =>
	orpc.workspaceInvites.cancel({ inviteId });

export const myInvitesQueryOptions = queryOptions({
	queryKey: ["my-invites"],
	queryFn: async () => {
		const invites = await orpc.workspaceInvites.findMine();
		return invites;
	},
});

export const acceptInvite = ({ inviteId }: { inviteId: string }) =>
	orpc.workspaceInvites.accept({ inviteId });
