import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import * as v from "valibot";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { FieldGroup } from "#/components/ui/field";
import { useAppForm } from "#/hooks/form";
import { usePageTitle } from "#/hooks/use-page-title";
import { instanceStatusQueryOptions } from "#/lib/data/instance";
import { toastError } from "#/lib/errors";
import { orpc } from "#/lib/orpc";

const ForgotPasswordSchema = v.object({
	email: v.pipe(
		v.string(),
		v.trim(),
		v.nonEmpty("Enter your email address."),
		v.email("Enter a valid email address."),
	),
});

export const Route = createFileRoute("/forgot-password")({
	component: RouteComponent,
	loader: ({ context: { queryClient } }) =>
		queryClient.ensureQueryData(instanceStatusQueryOptions),
});

function RouteComponent() {
	usePageTitle("Forgot password");
	const { data: status } = useSuspenseQuery(instanceStatusQueryOptions);
	const [sentTo, setSentTo] = useState<string | null>(null);

	const form = useAppForm({
		defaultValues: { email: "" },
		validators: { onSubmit: ForgotPasswordSchema },
		onSubmit: async ({ value }) => {
			try {
				const { email } = v.parse(ForgotPasswordSchema, value);
				await orpc.auth.requestPasswordReset({ email });
				setSentTo(email);
			} catch (e) {
				toastError(e);
			}
		},
	});

	return (
		<div className="flex h-dvh w-full items-center justify-center p-4">
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle>Reset your password</CardTitle>
				</CardHeader>
				<CardContent>
					{!status.emailEnabled ? (
						<p>
							This server can't send email. Ask your instance admin for a
							password reset link.
						</p>
					) : sentTo ? (
						<p className="[overflow-wrap:anywhere]">
							If there's an account for {sentTo}, a reset link is on its way. It
							expires in 24 hours. Check your spam folder if it doesn't arrive.
						</p>
					) : (
						<form
							onSubmit={(e) => {
								e.preventDefault();
								form.handleSubmit();
							}}
						>
							<FieldGroup>
								<form.AppField
									name="email"
									children={(field) => (
										<field.TextField
											label="Email"
											type="email"
											autoComplete="email"
										/>
									)}
								/>
							</FieldGroup>
							<form.AppForm>
								<form.SubscribeButton
									label="Email me a link"
									className="w-full"
								/>
							</form.AppForm>
						</form>
					)}
				</CardContent>
				<CardFooter>
					<Link to="/signin" className="underline underline-offset-3">
						Back to sign in
					</Link>
				</CardFooter>
			</Card>
		</div>
	);
}
