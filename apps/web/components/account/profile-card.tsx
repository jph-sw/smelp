import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import * as v from "valibot";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Button } from "#/components/ui/button";
import { FieldGroup } from "#/components/ui/field";
import { toast } from "#/components/ui/toast";
import { useAppForm } from "#/hooks/form";
import type { AuthUser } from "#/lib/auth";
import { avatarAsBase64, ImageFileError } from "#/lib/data/image-upload";
import { toastError } from "#/lib/errors";
import { orpc } from "#/lib/orpc";
import { initials } from "#/lib/utils";
import { SettingsSection } from "./settings-section";

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

export function ProfileCard({ user }: { user: AuthUser }) {
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
