import {
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useId, useRef, useState } from "react";
import * as v from "valibot";
import { ConfirmButton } from "#/components/confirm-button";
import { CopyLink } from "#/components/copy-link";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { FieldGroup } from "#/components/ui/field";
import { Switch } from "#/components/ui/switch";
import { toast } from "#/components/ui/toast";
import { useAppForm } from "#/hooks/form";
import { usePageTitle } from "#/hooks/use-page-title";
import { type AuthUser, currentUserQueryOptions } from "#/lib/auth";
import {
	apiTokensQueryOptions,
	createApiToken,
	revokeApiToken,
} from "#/lib/data/api-tokens";
import { avatarAsBase64, ImageFileError } from "#/lib/data/image-upload";
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
import { formatDate, formatRelativeTime, initials } from "#/lib/utils";

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
		toast({
			type: oidc === "linked" ? "success" : "error",
			description: Object.hasOwn(OIDC_LINK_MESSAGES, oidc)
				? OIDC_LINK_MESSAGES[oidc]
				: OIDC_LINK_MESSAGES.failed,
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
				toast({
					type: "success",
					description: "Password changed. Your other devices were signed out.",
				});
			} catch (e) {
				toastError(e);
			}
		},
	});

	return (
		<div className="mx-auto w-full max-w-4xl space-y-10 p-4 sm:p-8">
			<div className="flex items-baseline justify-between gap-4">
				<div className="min-w-0 space-y-1">
					<h1 className="text-xl font-medium">Account</h1>
					<p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
						Signed in as {user?.email}
					</p>
				</div>
				<Link to="/" className="shrink-0 underline underline-offset-3">
					Back to smelp
				</Link>
			</div>
			{user && <ProfileCard user={user} />}
			{user && <NotificationsCard user={user} />}
			{accounts && (accounts.providers.length > 0 || accounts.linkable) && (
				<SignInMethodsCard accounts={accounts} />
			)}
			{accounts?.hasPassword === false && <SetPasswordCard />}
			{/* Someone who only signs in through a provider has no password to change. */}
			{accounts?.hasPassword !== false && (
				<SettingsSection title="Change password">
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
				</SettingsSection>
			)}
			<ApiTokensCard />
		</div>
	);
}

function SettingsSection({
	title,
	description,
	className,
	children,
}: {
	title: string;
	description?: React.ReactNode;
	className?: string;
	children: React.ReactNode;
}) {
	const headingId = useId();
	return (
		<section
			aria-labelledby={headingId}
			className="grid gap-4 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:gap-10"
		>
			<div className="space-y-1">
				<h2 id={headingId} className="text-sm font-semibold">
					{title}
				</h2>
				{description && (
					<p className="text-sm text-muted-foreground">{description}</p>
				)}
			</div>
			<Card>
				<CardContent className={className}>{children}</CardContent>
			</Card>
		</section>
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
				toast({ type: "success", description: "Password set." });
			} catch (e) {
				toastError(e);
			}
		},
	});

	return (
		<SettingsSection
			title="Set a password"
			description="Your account has no password. A password lets you sign in without the provider."
		>
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
		</SettingsSection>
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
			toast({ type: "success", description: "Provider unlinked." });
		} catch (e) {
			toastError(e);
		} finally {
			setIsUnlinking(false);
		}
	};

	return (
		<SettingsSection title="Single sign-on" className="space-y-2">
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
		</SettingsSection>
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
				toast({ type: "success", description: "Profile saved." });
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
			if (e instanceof ImageFileError) {
				toast({ type: "error", description: e.message });
			} else {
				toastError(e);
			}
		} finally {
			setIsChangingPhoto(false);
		}
	};

	return (
		<SettingsSection
			title="Profile"
			description="Your name and photo appear on boards, member lists and comments."
			className="space-y-6"
		>
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
		</SettingsSection>
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
		<SettingsSection title="Notifications" className="space-y-2">
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
		</SettingsSection>
	);
}

const EXPIRY_DAYS = { "30": 30, "90": 90, "365": 365, never: null } as const;

const EXPIRY_ITEMS = [
	{ label: "30 days", value: "30" },
	{ label: "90 days", value: "90" },
	{ label: "1 year", value: "365" },
	{ label: "No expiry", value: "never" },
];

const ApiTokenSchema = v.object({
	name: v.pipe(
		v.string(),
		v.trim(),
		v.minLength(1, "Name the token, like the script or agent that uses it."),
		v.maxLength(100, "Use at most 100 characters."),
	),
	expiry: v.picklist(["30", "90", "365", "never"]),
});

function ApiTokensCard() {
	const queryClient = useQueryClient();
	const { data: tokens } = useQuery(apiTokensQueryOptions);
	const [newToken, setNewToken] = useState<{
		id: string;
		name: string;
		token: string;
	} | null>(null);

	const refresh = () =>
		queryClient.invalidateQueries({
			queryKey: apiTokensQueryOptions.queryKey,
		});

	const form = useAppForm({
		defaultValues: { name: "", expiry: "90" },
		validators: { onSubmit: ApiTokenSchema },
		onSubmit: async ({ value, formApi }) => {
			try {
				const { name, expiry } = v.parse(ApiTokenSchema, value);
				const created = await createApiToken({
					name,
					expiresInDays: EXPIRY_DAYS[expiry],
				});
				setNewToken({
					id: created.id,
					name: created.name,
					token: created.token,
				});
				formApi.reset();
				await refresh();
			} catch (e) {
				toastError(e);
			}
		},
	});

	const { mutate: revoke, isPending: isRevoking } = useMutation({
		mutationFn: revokeApiToken,
		onSuccess: (_, { id }) => {
			setNewToken((shown) => (shown?.id === id ? null : shown));
			toast({ type: "success", description: "Token revoked." });
		},
		onError: (e) => toastError(e),
		onSettled: refresh,
	});

	return (
		<SettingsSection
			title="API tokens"
			description={
				<>
					Scripts and agents can use a token to act as you, with the same access
					you have. Send it as{" "}
					<code className="[overflow-wrap:anywhere]">
						Authorization: Bearer &lt;token&gt;
					</code>
					.
				</>
			}
			className="space-y-4"
		>
			<CopyLink
				title="MCP endpoint"
				hint="AI agents like Claude Code and Cursor connect to it as an MCP server, with a token."
				link={`${window.location.origin}/mcp`}
				copiedMessage="Address copied."
			/>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					form.handleSubmit();
				}}
			>
				<FieldGroup className="sm:grid sm:grid-cols-[minmax(0,1fr)_12rem]">
					<form.AppField
						name="name"
						children={(field) => (
							<field.TextField label="Token name" autoComplete="off" />
						)}
					/>
					<form.AppField
						name="expiry"
						children={(field) => (
							<field.SelectField label="Expires after" items={EXPIRY_ITEMS} />
						)}
					/>
				</FieldGroup>
				<form.AppForm>
					<form.SubscribeButton label="Create token" />
				</form.AppForm>
			</form>

			{newToken && (
				<CopyLink
					title={`Your new token, ${newToken.name}`}
					hint="It won't be shown again, so copy it now."
					link={newToken.token}
					copiedMessage="Token copied."
				/>
			)}

			{tokens && tokens.length > 0 && (
				<div className="flex flex-col gap-1">
					{tokens.map((token) => (
						<div
							key={token.id}
							className="flex items-center gap-3 rounded-md py-2"
						>
							<div className="flex min-w-0 flex-col">
								<span className="text-sm font-medium [overflow-wrap:anywhere]">
									{token.name}
								</span>
								<span className="text-xs text-muted-foreground">
									Created {formatDate(token.createdAt)},{" "}
									{token.lastUsedAt === null
										? "never used"
										: `last used ${formatRelativeTime(token.lastUsedAt)}`}
									,{" "}
									{token.expiresAt === null
										? "no expiry"
										: `${token.expiresAt > Date.now() ? "expires" : "expired"} ${formatDate(token.expiresAt)}`}
								</span>
							</div>
							<div className="ml-auto">
								<ConfirmButton
									label={`Revoke ${token.name}`}
									buttonLabel="Revoke"
									title={`Revoke ${token.name}?`}
									description="Anything still using this token stops working right away. This can't be undone."
									confirmLabel="Revoke token"
									disabled={isRevoking}
									onConfirm={() => revoke({ id: token.id })}
								/>
							</div>
						</div>
					))}
				</div>
			)}
		</SettingsSection>
	);
}
