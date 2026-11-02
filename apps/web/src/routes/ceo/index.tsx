import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { CopyLink } from "#/components/copy-link";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { Switch } from "#/components/ui/switch";
import { toast } from "#/components/ui/toast";
import {
	createPasswordReset,
	instanceStatusQueryOptions,
	instanceUsersQueryOptions,
	sendTestEmail,
	updateInstance,
} from "#/lib/data/instance";
import { toastError } from "#/lib/errors";
import { formatDate, initials } from "#/lib/utils";

export const Route = createFileRoute("/ceo/")({
	component: RouteComponent,
	loader: ({ context: { queryClient } }) =>
		Promise.all([
			queryClient.ensureQueryData(instanceStatusQueryOptions),
			queryClient.ensureQueryData(instanceUsersQueryOptions),
		]),
});

function RouteComponent() {
	const queryClient = useQueryClient();
	const [resetLink, setResetLink] = useState<{
		displayName: string;
		link: string;
		emailed: boolean;
	} | null>(null);
	const { data: status } = useSuspenseQuery(instanceStatusQueryOptions);
	const { data: users } = useSuspenseQuery(instanceUsersQueryOptions);

	const { mutate: update, isPending } = useMutation({
		mutationFn: updateInstance,
		onError: (e) => toastError(e),
		onSettled: () =>
			queryClient.invalidateQueries({
				queryKey: instanceStatusQueryOptions.queryKey,
			}),
	});

	const { mutate: sendTest, isPending: isSendingTest } = useMutation({
		mutationFn: sendTestEmail,
		onSuccess: ({ to }) =>
			toast.add({ type: "success", description: `Test email sent to ${to}.` }),
		onError: (e) => toastError(e),
	});

	const { mutate: createReset, isPending: isCreatingReset } = useMutation({
		mutationFn: createPasswordReset,
		onSuccess: ({ token, emailDelivery }, { displayName }) => {
			setResetLink({
				displayName,
				link: `${window.location.origin}/reset-password/${token}`,
				emailed: emailDelivery === "sent",
			});
			if (emailDelivery === "failed") {
				toast.add({
					type: "error",
					description:
						"The reset email couldn't be sent. Copy the link instead.",
				});
			}
		},
		onError: (e) => toastError(e),
	});

	return (
		<div className="space-y-8">
			<div className="flex items-baseline justify-between gap-4">
				<h1 className="text-xl font-medium">Instance settings</h1>
				<Link to="/" className="underline underline-offset-3">
					Back to smelp
				</Link>
			</div>
			<Card>
				<CardContent className="flex items-center justify-between gap-4">
					<div>
						<h2 id="signup-label" className="text-sm font-semibold">
							Public sign-up
						</h2>
						<p className="text-card-foreground/70">
							When this is off, people can only join with an invite link from a
							workspace admin.
						</p>
					</div>
					<Switch
						aria-labelledby="signup-label"
						checked={status.signupOpen}
						disabled={isPending}
						onCheckedChange={(signupOpen) => update({ signupOpen })}
					/>
				</CardContent>
			</Card>
			<Card>
				<CardContent className="flex flex-wrap items-center justify-between gap-4">
					<div className="min-w-0 flex-1 basis-64">
						<h2 className="text-sm font-semibold">
							Email is {status.emailEnabled ? "on" : "off"}
						</h2>
						<p className="text-card-foreground/70">
							{status.emailEnabled
								? "Invites and password reset links are emailed, and people can reset a forgotten password themselves."
								: "Invite and password reset links are shown here to copy and send yourself. To turn email on, set SMTP_HOST, SMTP_FROM and APP_URL on the server."}
						</p>
					</div>
					{status.emailEnabled && (
						<Button
							variant="outline"
							disabled={isSendingTest}
							onClick={() => sendTest()}
						>
							Send test email
						</Button>
					)}
				</CardContent>
			</Card>
			{resetLink && (
				<CopyLink
					title={
						resetLink.emailed
							? `Reset link emailed to ${resetLink.displayName}. You can also copy it`
							: `Send this password reset link to ${resetLink.displayName}`
					}
					hint={
						resetLink.emailed
							? "It works once and expires in 24 hours."
							: "It works once and expires in 24 hours. It won't be shown again, so copy it now."
					}
					link={resetLink.link}
				/>
			)}
			<section className="flex flex-col gap-1" aria-labelledby="users-label">
				<h2
					id="users-label"
					className="text-xs font-medium text-muted-foreground"
				>
					Users
				</h2>
				{users.map((user) => (
					<div key={user.id} className="flex items-center gap-3 px-2 py-2">
						<Avatar size="sm">
							<AvatarImage src={user.image ?? undefined} alt="" />
							<AvatarFallback>{initials(user.displayName)}</AvatarFallback>
						</Avatar>
						<div className="flex min-w-0 flex-col">
							<span className="text-sm font-medium [overflow-wrap:anywhere]">
								{user.displayName}
							</span>
							<span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
								{user.email}
							</span>
						</div>
						<span
							className="ml-auto shrink-0 text-xs text-muted-foreground"
							title={`Joined ${formatDate(user.createdAt)}`}
						>
							{user.role === "admin" ? "Instance admin" : "User"}
						</span>
						<Button
							variant="ghost"
							size="sm"
							className="shrink-0"
							disabled={isCreatingReset}
							aria-label={`Create a password reset link for ${user.displayName}`}
							onClick={() =>
								createReset({
									userId: user.id,
									displayName: user.displayName,
								})
							}
						>
							Reset password
						</Button>
					</div>
				))}
			</section>
		</div>
	);
}
