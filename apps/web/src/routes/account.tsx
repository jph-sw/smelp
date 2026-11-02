import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useRef, useState } from "react";
import * as v from "valibot";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { FieldGroup } from "#/components/ui/field";
import { toast } from "#/components/ui/toast";
import { useAppForm } from "#/hooks/form";
import { type AuthUser, currentUserQueryOptions } from "#/lib/auth";
import { AvatarFileError, avatarAsBase64 } from "#/lib/data/avatar";
import { NewPasswordSchema, PASSWORDS_DIFFER } from "#/lib/data/password";
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
	component: RouteComponent,
	beforeLoad: ({ context }) => {
		if (context.user == null) throw redirect({ to: "/signin" });
	},
});

function RouteComponent() {
	const { data: user } = useSuspenseQuery(currentUserQueryOptions);

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
		</div>
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
