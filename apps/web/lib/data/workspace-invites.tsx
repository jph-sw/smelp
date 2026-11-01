import { queryOptions } from "@tanstack/react-query";
import { orpc } from "../orpc";

export const workspaceInvitesQueryOptions = ({
	workspaceId,
}: {
	workspaceId: string;
}) =>
	queryOptions({
		queryKey: ["workspace-invites", workspaceId],
		queryFn: () => orpc.workspaceInvites.find({ workspaceId }),
	});

export const invitePreviewQueryOptions = ({ token }: { token: string }) =>
	queryOptions({
		queryKey: ["invite-preview", token],
		queryFn: () => orpc.workspaceInvites.preview({ token }),
		retry: false,
	});

export const createInvite = (input: {
	workspaceId: string;
	email?: string;
	role: "guest" | "member" | "admin";
}) => orpc.workspaceInvites.create(input);

export const cancelInvite = ({ inviteId }: { inviteId: string }) =>
	orpc.workspaceInvites.cancel({ inviteId });

export const acceptInvite = ({ token }: { token: string }) =>
	orpc.workspaceInvites.accept({ token });
