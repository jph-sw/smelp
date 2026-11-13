import {
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useId, useRef, useState } from "react";
import * as v from "valibot";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { FieldGroup } from "#/components/ui/field";
import { Switch } from "#/components/ui/switch";
import { toast } from "#/components/ui/toast";
import { useAppForm } from "#/hooks/form";
import { usePageTitle } from "#/hooks/use-page-title";
import { type AuthUser, currentUserQueryOptions } from "#/lib/auth";
import { AvatarFileError, avatarAsBase64 } from "#/lib/data/avatar";
import { instanceStatusQueryOptions } from "#/lib/data/instance";
import { NewPasswordSchema, PASSWORDS_DIFFER } from "#/lib/data/password";
import {
	linkedAccountsQueryOptions,
	OIDC_LINK_MESSAGES,
	setPassword,
	startOidcLink,
	unlinkOidc,
} from "#/lib/data/sign-in-options";
import { toastError } from "#/lib/errors";
import { orpc } from "#/lib/orpc";
import { initials } from "#/lib/utils";

const ChangePasswordSchema = v.pipe(
	v.object({
		currentPassword: v.pipe(
			v.string(),
			v.minLength(1, "Enter your current password."),
		),
		password: NewPasswordSchema,
		confirm: v.string(),
	}),
	v.forward(
		v.partialCheck(
			[["password"], ["confirm"]],
			(input) => input.password === input.confirm,
			PASSWORDS_DIFFER,
		),
		["confirm"],
	),
);

const ProfileSchema = v.object({
	fullName: v.pipe(
		v.string(),
		v.trim(),
		v.minLength(1, "Enter your full name."),
		v.maxLength(80, "Use at most 80 characters."),
	),
	displayName: v.pipe(
		v.string(),
		v.trim(),
		v.minLength(1, "Enter a display name."),
		v.maxLength(40, "Use at most 40 characters."),
	),
});

export const Route = createFileRoute("/account")({
	validateSearch: (search: Record<string, unknown>): { oidc?: string } => ({
		oidc: typeof search.oidc === "string" ? search.oidc : undefined,
	}),
	component: RouteComponent,
	beforeLoad: ({ context }) => {
		if (context.user == null) throw redirect({ to: "/signin" });
	},
});

function RouteComponent() {
	usePageTitle("Account");
	const { data: user } = useSuspenseQuery(currentUserQueryOptions);
	const { data: accounts } = useQuery(linkedAccountsQueryOptions);
	const { oidc } = Route.useSearch();
	const navigate = Route.useNavigate();

	// Where linking a provider ends up. Said once, then taken out of the address.
	useEffect(() => {
		if (!oidc) return;
		toast.add({
			type: oidc === "linked" ? "success" : "error",
			description: OIDC_LINK_MESSAGES[oidc] ?? OIDC_LINK_MESSAGES.failed,
		});
		navigate({ search: {}, replace: true });
	}, [oidc, navigate]);

	const form = useAppForm({
		defaultValues: { currentPassword: "", password: "", confirm: "" },
		validators: { onSubmit: ChangePasswordSchema },
		onSubmit: async ({ value, formApi }) => {
			try {
				await orpc.auth.changePassword({
					currentPassword: value.currentPassword,
					newPassword: value.password,
				});
				formApi.reset();
				toast.add({
					type: "success",
					description: "Password changed. Your other devices were signed out.",
				});
			} catch (e) {
				toastError(e);
			}
		},
	});

	return (
		<div className="mx-auto w-full max-w-md space-y-6 p-4 sm:p-8">
			<div className="flex items-baseline justify-between gap-4">
				<h1 className="text-xl font-medium">Account</h1>
				<Link to="/" className="underline underline-offset-3">
					Back to smelp
				</Link>
			</div>
			<p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
				Signed in as {user?.email}
			</p>
			{user && <ProfileCard user={user} />}
			{user && <NotificationsCard user={user} />}
			{accounts && (accounts.providers.length > 0 || accounts.linkable) && (
				<SignInMethodsCard accounts={accounts} />
			)}
			{accounts?.hasPassword === false && <SetPasswordCard />}
			{/* Someone who only signs in through a provider has no password to change. */}
			{accounts?.hasPassword !== false && (
				<Card>
					<CardHeader>
						<CardTitle className="text-sm">Change password</CardTitle>
					</CardHeader>
					<CardContent>
						<form
							onSubmit={(e) => {
								e.preventDefault();
								form.handleSubmit();
							}}
						>
							<FieldGroup>
								<form.AppField
									name="currentPassword"
									children={(field) => (
										<field.TextField
											label="Current password"
											type="password"
											autoComplete="current-password"
										/>
									)}
								/>
								<form.AppField
									name="password"
									children={(field) => (
										<field.TextField
											label="New password"
											type="password"
											autoComplete="new-password"
										/>
									)}
								/>
								<form.AppField
									name="confirm"
									children={(field) => (
										<field.TextField
											label="Confirm new password"
											type="password"
											autoComplete="new-password"
										/>
									)}
								/>
							</FieldGroup>
							<form.AppForm>
								<form.SubscribeButton label="Change password" />
							</form.AppForm>
						</form>
					</CardContent>
				</Card>
			)}
		</div>
	);
}

const SetPasswordSchema = v.pipe(
	v.object({ password: NewPasswordSchema, confirm: v.string() }),
	v.forward(
		v.partialCheck(
			[["password"], ["confirm"]],
			(input) => input.password === input.confirm,
			PASSWORDS_DIFFER,
		),
		["confirm"],
	),
);

function SetPasswordCard() {
	const queryClient = useQueryClient();
	const form = useAppForm({
		defaultValues: { password: "", confirm: "" },
		validators: { onSubmit: SetPasswordSchema },
		onSubmit: async ({ value, formApi }) => {
			try {
				await setPassword(value.password);
				formApi.reset();
				await queryClient.invalidateQueries({
					queryKey: linkedAccountsQueryOptions.queryKey,
				});
				toast.add({ type: "success", description: "Password set." });
			} catch (e) {
				toastError(e);
			}
		},
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-sm">Set a password</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<p className="text-xs text-muted-foreground">
					Your account has no password. A password lets you sign in without the
					provider.
				</p>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						form.handleSubmit();
					}}
				>
					<FieldGroup>
						<form.AppField
							name="password"
							children={(field) => (
								<field.TextField
									label="New password"
									type="password"
									autoComplete="new-password"
								/>
							)}
						/>
						<form.AppField
							name="confirm"
							children={(field) => (
								<field.TextField
									label="Confirm new password"
									type="password"
									autoComplete="new-password"
								/>
							)}
						/>
					</FieldGroup>
					<form.AppForm>
						<form.SubscribeButton label="Set password" />
					</form.AppForm>
				</form>
			</CardContent>
		</Card>
	);
}

function SignInMethodsCard({
	accounts,
}: {
	accounts: {
		hasPassword: boolean;
		providers: { label: string }[];
		linkable: { name: string } | null;
	};
}) {
	const queryClient = useQueryClient();
	const [isUnlinking, setIsUnlinking] = useState(false);
	const [isLinking, setIsLinking] = useState(false);

	const link = async () => {
		setIsLinking(true);
		try {
			const { url } = await startOidcLink();
			// Leaves for the provider, which sends the browser back here.
			window.location.assign(url);
		} catch (e) {
			toastError(e);
			setIsLinking(false);
		}
	};

	const unlink = async () => {
		setIsUnlinking(true);
		try {
			await unlinkOidc();
			await queryClient.invalidateQueries({
				queryKey: linkedAccountsQueryOptions.queryKey,
			});
			toast.add({ type: "success", description: "Provider unlinked." });
		} catch (e) {
			toastError(e);
		} finally {
			setIsUnlinking(false);
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-sm">Single sign-on</CardTitle>
			</CardHeader>
			<CardContent className="space-y-2">
				{accounts.providers.map((provider) => (
					<div
						key={provider.label}
						className="flex items-center justify-between gap-4"
					>
						<span className="text-sm [overflow-wrap:anywhere]">
							Linked to {provider.label}
						</span>
						{accounts.hasPassword && (
							<Button
								type="button"
								variant="outline"
								disabled={isUnlinking}
								onClick={unlink}
							>
								Unlink
							</Button>
						)}
					</div>
				))}
				{accounts.linkable && (
					<Button
						type="button"
						variant="outline"
						disabled={isLinking}
						onClick={link}
					>
						Link {accounts.linkable.name}
					</Button>
				)}
				{!accounts.hasPassword && accounts.providers.length > 0 && (
					<p className="text-xs text-muted-foreground">
						This is the only way you can sign in, because your account has no
						password, so it can't be unlinked.
					</p>
				)}
			</CardContent>
		</Card>
	);
}

function ProfileCard({ user }: { user: AuthUser }) {
	const queryClient = useQueryClient();
	const fileInput = useRef<HTMLInputElement>(null);
	const [isChangingPhoto, setIsChangingPhoto] = useState(false);

	// Names and avatars appear on boards, member lists and comments.
	const refresh = () => queryClient.invalidateQueries();

	const form = useAppForm({
		defaultValues: { fullName: user.fullName, displayName: user.displayName },
		validators: { onSubmit: ProfileSchema },
		onSubmit: async ({ value, formApi }) => {
			try {
				const profile = v.parse(ProfileSchema, value);
				await orpc.auth.updateProfile(profile);
				// Shows the names as saved, without any spaces the server trimmed.
				formApi.reset(profile);
				await refresh();
				toast.add({ type: "success", description: "Profile saved." });
			} catch (e) {
				toastError(e);
			}
		},
	});

	const changePhoto = async (action: () => Promise<unknown>) => {
		setIsChangingPhoto(true);
		try {
			await action();
			await refresh();
		} catch (e) {
			if (e instanceof AvatarFileError) {
				toast.add({ type: "error", description: e.message });
			} else {
				toastError(e);
			}
		} finally {
			setIsChangingPhoto(false);
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-sm">Profile</CardTitle>
			</CardHeader>
			<CardContent className="space-y-6">
				<div className="flex items-center gap-4">
					<Avatar size="lg">
						<AvatarImage src={user.image ?? undefined} alt="" />
						<AvatarFallback>{initials(user.displayName)}</AvatarFallback>
					</Avatar>
					<div className="flex flex-wrap gap-2">
						<input
							ref={fileInput}
							type="file"
							accept="image/png,image/jpeg,image/webp"
							className="hidden"
							aria-label="Choose a photo"
							onChange={(e) => {
								const file = e.target.files?.[0];
								// Lets the same file be chosen again after an error.
								e.target.value = "";
								if (!file) return;
								changePhoto(async () =>
									orpc.auth.setAvatar({ image: await avatarAsBase64(file) }),
								);
							}}
						/>
						<Button
							type="button"
							variant="outline"
							disabled={isChangingPhoto}
							onClick={() => fileInput.current?.click()}
						>
							{user.image ? "Change photo" : "Upload photo"}
						</Button>
						{user.image && (
							<Button
								type="button"
								variant="ghost"
								disabled={isChangingPhoto}
								onClick={() => changePhoto(() => orpc.auth.removeAvatar())}
							>
								Remove
							</Button>
						)}
					</div>
				</div>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						form.handleSubmit();
					}}
				>
					<FieldGroup>
						<form.AppField
							name="fullName"
							children={(field) => (
								<field.TextField label="Full name" autoComplete="name" />
							)}
						/>
						<form.AppField
							name="displayName"
							children={(field) => (
								<field.TextField label="Display name" autoComplete="username" />
							)}
						/>
					</FieldGroup>
					<form.AppForm>
						<form.SubscribeButton label="Save profile" />
					</form.AppForm>
				</form>
			</CardContent>
		</Card>
	);
}

function NotificationsCard({ user }: { user: AuthUser }) {
	const queryClient = useQueryClient();
	const { data: status } = useQuery(instanceStatusQueryOptions);
	const [isSaving, setIsSaving] = useState(false);
	const labelId = useId();

	const change = async (emailNotifications: boolean) => {
		setIsSaving(true);
		try {
			await orpc.auth.updateNotificationPreferences({ emailNotifications });
			await queryClient.invalidateQueries({
				queryKey: currentUserQueryOptions.queryKey,
			});
		} catch (e) {
			toastError(e);
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-sm">Notifications</CardTitle>
			</CardHeader>
			<CardContent className="space-y-2">
				<div className="flex items-center justify-between gap-4">
					<span id={labelId} className="text-sm">
						Email me about new notifications
					</span>
					<Switch
						aria-labelledby={labelId}
						checked={user.notifyByEmail === 1}
						disabled={isSaving}
						onCheckedChange={change}
					/>
				</div>
				<p className="text-xs text-muted-foreground">
					{status && !status.emailEnabled
						? "This install can't send email yet, so you'll only see notifications in your inbox."
						: "Assignments, comments on your work and mentions also arrive by email. The inbox always has them."}
				</p>
			</CardContent>
		</Card>
	);
}
