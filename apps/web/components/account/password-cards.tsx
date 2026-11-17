import { useQueryClient } from "@tanstack/react-query";
import * as v from "valibot";
import { FieldGroup } from "#/components/ui/field";
import { toast } from "#/components/ui/toast";
import { useAppForm } from "#/hooks/form";
import { NewPasswordSchema, PASSWORDS_DIFFER } from "#/lib/data/password";
import {
	linkedAccountsQueryOptions,
	setPassword,
} from "#/lib/data/sign-in-options";
import { toastError } from "#/lib/errors";
import { orpc } from "#/lib/orpc";
import { SettingsSection } from "./settings-section";

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

export function ChangePasswordCard() {
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

export function SetPasswordCard() {
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
