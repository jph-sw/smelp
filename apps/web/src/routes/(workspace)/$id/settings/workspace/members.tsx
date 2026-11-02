import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import * as v from "valibot";
import { CopyLink } from "#/components/copy-link";
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "#/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Button } from "#/components/ui/button";
import { FieldGroup } from "#/components/ui/field";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { toast } from "#/components/ui/toast";
import { useAppForm } from "#/hooks/form";
import {
	cancelInvite,
	createInvite,
	workspaceInvitesQueryOptions,
} from "#/lib/data/workspace-invites";
import {
	leaveWorkspace,
	removeWorkspaceMember,
	updateWorkspaceMemberRole,
	useWorkspaceAccess,
	workspaceMembersQueryOptions,
} from "#/lib/data/workspace-members";
import { toastError } from "#/lib/errors";
import { formatDate, initials } from "#/lib/utils";

const InviteMemberSchema = v.object({
	email: v.union(
		[v.literal(""), v.pipe(v.string(), v.trim(), v.email())],
		"Enter a valid email address, or leave this empty.",
	),
	role: v.picklist(["guest", "member", "admin"]),
});

type Role = "guest" | "member" | "admin";

const ROLE_ITEMS: { label: string; value: Role }[] = [
	{ label: "Guest", value: "guest" },
	{ label: "Member", value: "member" },
	{ label: "Admin", value: "admin" },
];

export const Route = createFileRoute(
	"/(workspace)/$id/settings/workspace/members",
)({
	component: RouteComponent,
	loader: async ({ context: { queryClient }, params: { id } }) => {
		await Promise.all([
			queryClient.ensureQueryData(
				workspaceMembersQueryOptions({ workspaceId: id }),
			),
		]);
	},
});

function InviteSection({ workspaceId }: { workspaceId: string }) {
	const queryClient = useQueryClient();

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
		<>
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
		</>
	);
}

function RoleSelect({
	label,
	value,
	onChange,
}: {
	label: string;
	value: string;
	onChange: (role: Role) => void;
}) {
	return (
		<Select
			items={ROLE_ITEMS}
			value={value}
			onValueChange={(next) => next && onChange(next as Role)}
		>
			<SelectTrigger aria-label={label} className="w-24 shrink-0">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{ROLE_ITEMS.map((item) => (
					<SelectItem key={item.value} value={item.value}>
						{item.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

function ConfirmButton({
	label,
	title,
	description,
	confirmLabel,
	buttonLabel,
	disabled,
	onConfirm,
}: {
	label?: string;
	title: string;
	description: string;
	confirmLabel: string;
	buttonLabel: string;
	disabled?: boolean;
	onConfirm: () => void;
}) {
	return (
		<AlertDialog>
			<AlertDialogTrigger
				aria-label={label}
				render={<Button variant="ghost" size="sm" className="shrink-0" />}
			>
				{buttonLabel}
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle className="[overflow-wrap:anywhere]">
						{title}
					</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogCancel
						variant="destructive"
						disabled={disabled}
						onClick={onConfirm}
					>
						{confirmLabel}
					</AlertDialogCancel>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

function RouteComponent() {
	const { id: workspaceId } = Route.useParams();
	const navigate = Route.useNavigate();
	const queryClient = useQueryClient();
	const { me, members, canManage } = useWorkspaceAccess(workspaceId);

	const refresh = () =>
		Promise.all([
			queryClient.invalidateQueries({
				queryKey: ["workspace-members", workspaceId],
			}),
			queryClient.invalidateQueries({ queryKey: ["project-members"] }),
			queryClient.invalidateQueries({
				queryKey: ["workspace-invites", workspaceId],
			}),
			queryClient.invalidateQueries({ queryKey: ["issues"] }),
		]);

	const { mutate: changeRole } = useMutation({
		mutationFn: updateWorkspaceMemberRole,
		onError: (e) => toastError(e),
		onSettled: refresh,
	});
	const { mutate: remove, isPending: isRemoving } = useMutation({
		mutationFn: removeWorkspaceMember,
		onError: (e) => toastError(e),
		onSettled: refresh,
	});
	const { mutate: leave, isPending: isLeaving } = useMutation({
		mutationFn: leaveWorkspace,
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
			queryClient.removeQueries({ queryKey: ["workspace", workspaceId] });
			queryClient.removeQueries({ queryKey: ["projects", workspaceId] });
			queryClient.removeQueries({
				queryKey: ["workspace-members", workspaceId],
			});
			toast.add({ type: "success", description: "You left the workspace." });
			navigate({ to: "/" });
		},
		onError: (e) => toastError(e),
	});

	return (
		<div className="flex flex-col gap-8">
			{canManage && <InviteSection workspaceId={workspaceId} />}

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
						<div className="ml-auto flex shrink-0 items-center gap-1">
							{canManage ? (
								<>
									<RoleSelect
										label={`Role for ${member.displayName}`}
										value={member.role}
										onChange={(role) =>
											changeRole({
												workspaceId,
												memberId: member.id,
												role,
											})
										}
									/>
									{member.id !== me?.id && (
										<ConfirmButton
											label={`Remove ${member.displayName}`}
											buttonLabel="Remove"
											title={`Remove ${member.displayName}?`}
											description="They lose access to this workspace and all of its projects, and their work items become unassigned. You can invite them again later."
											confirmLabel="Remove member"
											disabled={isRemoving}
											onConfirm={() =>
												remove({ workspaceId, memberId: member.id })
											}
										/>
									)}
								</>
							) : (
								<span className="text-xs text-muted-foreground capitalize">
									{member.role}
								</span>
							)}
						</div>
					</div>
				))}
			</div>

			{me && (
				<div className="self-start">
					<ConfirmButton
						buttonLabel="Leave workspace"
						title="Leave this workspace?"
						description="You lose access to this workspace and all of its projects, and your work items become unassigned. You'd need a new invite to come back."
						confirmLabel="Leave workspace"
						disabled={isLeaving}
						onConfirm={() => leave({ workspaceId })}
					/>
				</div>
			)}
		</div>
	);
}
