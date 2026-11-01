import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import * as v from "valibot";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { FieldGroup } from "#/components/ui/field";
import { toast } from "#/components/ui/toast";
import { useAppForm } from "#/hooks/form";
import { currentUserQueryOptions } from "#/lib/auth";
import { NewPasswordSchema, PASSWORDS_DIFFER } from "#/lib/data/password";
import { toastError } from "#/lib/errors";
import { orpc } from "#/lib/orpc";

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
