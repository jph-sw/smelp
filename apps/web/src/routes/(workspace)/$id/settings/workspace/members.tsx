import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import * as v from "valibot";
import { CopyLink } from "#/components/copy-link";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Button } from "#/components/ui/button";
import { FieldGroup } from "#/components/ui/field";
import { useAppForm } from "#/hooks/form";
import {
	cancelInvite,
	createInvite,
	workspaceInvitesQueryOptions,
} from "#/lib/data/workspace-invites";
import { workspaceMembersQueryOptions } from "#/lib/data/workspace-members";
import { toastError } from "#/lib/errors";
import { formatDate, initials } from "#/lib/utils";

const InviteMemberSchema = v.object({
	email: v.union(
		[v.literal(""), v.pipe(v.string(), v.trim(), v.email())],
		"Enter a valid email address, or leave this empty.",
	),
	role: v.picklist(["guest", "member", "admin"]),
});

export const Route = createFileRoute(
	"/(workspace)/$id/settings/workspace/members",
)({
	component: RouteComponent,
	loader: async ({ context: { queryClient }, params: { id } }) => {
		await Promise.all([
			queryClient.ensureQueryData(
				workspaceMembersQueryOptions({ workspaceId: id }),
			),
			queryClient.ensureQueryData(
				workspaceInvitesQueryOptions({ workspaceId: id }),
			),
		]);
	},
});

function RouteComponent() {
	const { id: workspaceId } = Route.useParams();
	const queryClient = useQueryClient();

	const { data: members } = useSuspenseQuery(
		workspaceMembersQueryOptions({ workspaceId }),
	);
	const { data: invites } = useSuspenseQuery(
		workspaceInvitesQueryOptions({ workspaceId }),
	);
	const invitesQueryKey = workspaceInvitesQueryOptions({
		workspaceId,
	}).queryKey;

	const [newLink, setNewLink] = useState<string | null>(null);

	const form = useAppForm({
		defaultValues: {
			email: "",
			role: "member" as "guest" | "member" | "admin",
		},
		validators: {
			onSubmit: InviteMemberSchema,
		},
		onSubmit: async ({ value, formApi }) => {
			try {
				const invite = await createInvite({
					workspaceId,
					email: value.email || undefined,
					role: value.role,
				});
				await queryClient.invalidateQueries({ queryKey: invitesQueryKey });
				setNewLink(`${window.location.origin}/invite/${invite.token}`);
				formApi.reset();
			} catch (e) {
				toastError(e);
			}
		},
	});

	const { mutate: revokeInvite } = useMutation({
		mutationFn: cancelInvite,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: invitesQueryKey });
		},
		onError: (e) => toastError(e),
	});

	return (
		<div className="flex flex-col gap-8">
			<form
				onSubmit={(e) => {
					e.preventDefault();
					form.handleSubmit();
				}}
			>
				<FieldGroup className="gap-2 sm:flex-row sm:items-end">
					<form.AppField
						name="email"
						children={(field) => (
							<field.TextField
								label="Email (optional)"
								type="email"
								className="sm:min-w-0 sm:flex-1"
							/>
						)}
					/>
					<form.AppField
						name="role"
						children={(field) => (
							<field.SelectField
								label="Role"
								className="sm:w-32 sm:shrink-0"
								items={[
									{ label: "Guest", value: "guest" },
									{ label: "Member", value: "member" },
									{ label: "Admin", value: "admin" },
								]}
							/>
						)}
					/>
					<form.AppForm>
						<form.SubscribeButton
							label="Create invite link"
							className="shrink-0 sm:mt-0"
						/>
					</form.AppForm>
				</FieldGroup>
			</form>

			{newLink && (
				<CopyLink
					title="Send this link to the person you're inviting"
					hint="It works once and expires in 7 days. It won't be shown again, so copy it now."
					link={newLink}
				/>
			)}

			{invites.length > 0 && (
				<div className="flex flex-col gap-1">
					<span className="text-xs font-medium text-muted-foreground">
						Pending invites
					</span>
					{invites.map((invite) => (
						<div
							key={invite.id}
							className="flex items-center gap-3 rounded-md px-2 py-2"
						>
							<div className="flex min-w-0 flex-col">
								<span className="text-sm font-medium [overflow-wrap:anywhere]">
									{invite.email ?? "Invite link"}
								</span>
								<span className="text-xs text-muted-foreground">
									<span className="capitalize">{invite.role}</span>, expires{" "}
									{formatDate(invite.expiresAt)}
								</span>
							</div>
							<Button
								variant="ghost"
								size="sm"
								className="ml-auto shrink-0"
								onClick={() => revokeInvite({ inviteId: invite.id })}
							>
								Revoke
							</Button>
						</div>
					))}
				</div>
			)}

			<div className="flex flex-col gap-1">
				<span className="text-xs font-medium text-muted-foreground">
					Members
				</span>
				{members.map((member) => (
					<div
						key={member.id}
						className="flex items-center gap-3 rounded-md px-2 py-2"
					>
						<Avatar size="sm">
							<AvatarImage src={member.image ?? undefined} />
							<AvatarFallback>{initials(member.displayName)}</AvatarFallback>
						</Avatar>
						<div className="flex min-w-0 flex-col">
							<span className="text-sm font-medium">{member.displayName}</span>
							<span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
								{member.email}
							</span>
						</div>
						<span className="ml-auto shrink-0 text-xs text-muted-foreground capitalize">
							{member.role}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}
