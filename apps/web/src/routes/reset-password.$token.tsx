import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as v from "valibot";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { FieldGroup } from "#/components/ui/field";
import { toast } from "#/components/ui/toast";
import { useAppForm } from "#/hooks/form";
import { usePageTitle } from "#/hooks/use-page-title";
import { endSession } from "#/lib/auth";
import { NewPasswordSchema, PASSWORDS_DIFFER } from "#/lib/data/password";
import { toastError } from "#/lib/errors";
import { orpc } from "#/lib/orpc";

const ResetSchema = v.pipe(
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

export const Route = createFileRoute("/reset-password/$token")({
	component: RouteComponent,
	loader: ({ context: { queryClient }, params: { token } }) =>
		queryClient.ensureQueryData({
			queryKey: ["password-reset", token],
			queryFn: () => orpc.auth.previewPasswordReset({ token }),
			retry: false,
		}),
});

function RouteComponent() {
	usePageTitle("Reset password");
	const { token } = Route.useParams();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { data: reset } = useSuspenseQuery({
		queryKey: ["password-reset", token],
		queryFn: () => orpc.auth.previewPasswordReset({ token }),
		retry: false,
	});

	const form = useAppForm({
		defaultValues: { password: "", confirm: "" },
		validators: { onSubmit: ResetSchema },
		onSubmit: async ({ value }) => {
			try {
				await orpc.auth.resetPassword({ token, newPassword: value.password });
				toast({
					type: "success",
					description: "Password changed. Sign in with your new password.",
				});
				// The reset signed out every session, including one in this browser.
				await endSession(queryClient, () => navigate({ to: "/signin" }));
			} catch (e) {
				toastError(e);
			}
		},
	});

	return (
		<div className="flex min-h-dvh w-full items-center justify-center p-4">
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle>Choose a new password</CardTitle>
					<CardDescription className="[overflow-wrap:anywhere]">
						For {reset.email}. This signs out all of this account's devices.
					</CardDescription>
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
							<form.SubscribeButton
								label="Set new password"
								className="w-full"
							/>
						</form.AppForm>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
