import { ORPCError } from "@orpc/client";
import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Button } from "#/components/ui/button";
import { FieldGroup } from "#/components/ui/field";
import { toast } from "#/components/ui/toast";
import { useAppForm } from "#/hooks/form";
import {
	cancelInvite,
	createInvite,
	workspaceInvitesQueryOptions,
} from "#/lib/data/workspace-invites";
import { workspaceMembersQueryOptions } from "#/lib/data/workspace-members";

const InviteMemberSchema = v.object({
	email: v.pipe(v.string(), v.email()),
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
				await createInvite({
					workspaceId,
					email: value.email,
					role: value.role,
				});
				await queryClient.invalidateQueries({ queryKey: invitesQueryKey });
				toast.add({
					type: "success",
					description: `Invited ${value.email}.`,
				});
				formApi.reset();
			} catch (e) {
				if (e instanceof ORPCError) {
					toast.add({ type: "error", description: e.message });
				}
			}
		},
	});

	const { mutate: revokeInvite } = useMutation({
		mutationFn: cancelInvite,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: invitesQueryKey });
		},
	});

	return (
		<div className="flex flex-col gap-8">
			<form
				onSubmit={(e) => {
					e.preventDefault();
					form.handleSubmit();
				}}
			>
				<FieldGroup className="flex items-end gap-2">
					<form.AppField
						name="email"
						children={(field) => (
							<field.TextField label="Email" className="flex-1" />
						)}
					/>
					<form.AppField
						name="role"
						children={(field) => (
							<field.SelectField
								label="Role"
								items={[
									{ label: "Guest", value: "guest" },
									{ label: "Member", value: "member" },
									{ label: "Admin", value: "admin" },
								]}
							/>
						)}
					/>
					<form.AppForm>
						<form.SubscribeButton label="Invite" />
					</form.AppForm>
				</FieldGroup>
			</form>

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
							<div className="flex flex-col">
								<span className="text-sm font-medium">{invite.email}</span>
								<span className="text-xs text-muted-foreground capitalize">
									{invite.role}
								</span>
							</div>
							<Button
								variant="ghost"
								size="sm"
								className="ml-auto"
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
							<AvatarFallback>
								{member.displayName.slice(0, 2).toUpperCase()}
							</AvatarFallback>
						</Avatar>
						<div className="flex flex-col">
							<span className="text-sm font-medium">{member.displayName}</span>
							<span className="text-xs text-muted-foreground">
								{member.email}
							</span>
						</div>
						<span className="ml-auto text-xs text-muted-foreground capitalize">
							{member.role}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}
