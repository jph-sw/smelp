import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	redirect,
	useNavigate,
} from "@tanstack/react-router";
import * as v from "valibot";
import { InsecureCookieWarning } from "#/components/insecure-cookie-warning";
import { OidcButton } from "#/components/oidc-button";
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
import {
	OIDC_ERROR_MESSAGES,
	signInOptionsQueryOptions,
} from "#/lib/data/sign-in-options";
import { toastError } from "#/lib/errors";
import { signIn, startSession } from "../../lib/auth";

const SignInSchema = v.object({
	email: v.pipe(v.string(), v.email("Enter a valid email address.")),
	password: v.pipe(v.string(), v.minLength(1, "Enter your password.")),
});

export const Route = createFileRoute("/signin")({
	validateSearch: (
		search: Record<string, unknown>,
	): { invite?: string; oidcError?: string } => ({
		invite: typeof search.invite === "string" ? search.invite : undefined,
		oidcError:
			typeof search.oidcError === "string" ? search.oidcError : undefined,
	}),
	beforeLoad: ({ context, search }) => {
		if (context.user != null) {
			throw search.invite
				? redirect({ to: "/invite/$token", params: { token: search.invite } })
				: redirect({ to: "/" });
		}
	},
	loader: async ({ context: { queryClient } }) => {
		const [status] = await Promise.all([
			queryClient.ensureQueryData(instanceStatusQueryOptions),
			queryClient.ensureQueryData(signInOptionsQueryOptions),
		]);
		if (status.needsSetup) throw redirect({ to: "/signup" });
	},
	component: SignIn,
});

function SignIn() {
	usePageTitle("Sign in");
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { invite, oidcError } = Route.useSearch();
	const { data: status } = useSuspenseQuery(instanceStatusQueryOptions);
	const form = useAppForm({
		defaultValues: {
			email: "",
			password: "",
		},
		validators: {
			onSubmit: SignInSchema,
		},
		onSubmit: async ({ value }) => {
			try {
				await signIn(value.email, value.password);
				await startSession(queryClient);
				if (invite) {
					navigate({ to: "/invite/$token", params: { token: invite } });
				} else {
					navigate({ to: "/" });
				}
			} catch (error) {
				toastError(error);
			}
		},
	});

	return (
		<div className="flex h-dvh w-full items-center justify-center p-4">
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle>Sign in</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<InsecureCookieWarning />
					{oidcError && (
						<p role="alert" className="text-sm text-destructive">
							{Object.hasOwn(OIDC_ERROR_MESSAGES, oidcError)
								? OIDC_ERROR_MESSAGES[oidcError]
								: OIDC_ERROR_MESSAGES.failed}
						</p>
					)}
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
							<form.AppField
								name="password"
								children={(field) => (
									<field.TextField
										label="Password"
										type="password"
										autoComplete="current-password"
									/>
								)}
							/>
						</FieldGroup>
						<form.AppForm>
							<form.SubscribeButton label="Sign in" className="w-full" />
						</form.AppForm>
					</form>
					<OidcButton invite={invite} />
				</CardContent>
				{(status.signupOpen || invite || status.emailEnabled) && (
					<CardFooter className="flex-col items-start gap-2">
						{status.emailEnabled && (
							<Link
								to="/forgot-password"
								className="underline underline-offset-3"
							>
								Forgot your password?
							</Link>
						)}
						{(status.signupOpen || invite) && (
							<p>
								No account?{" "}
								<Link
									to="/signup"
									search={{ invite }}
									className="underline underline-offset-3"
								>
									Sign up
								</Link>
							</p>
						)}
					</CardFooter>
				)}
			</Card>
		</div>
	);
}
