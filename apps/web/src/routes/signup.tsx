import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	redirect,
	useNavigate,
} from "@tanstack/react-router";
import * as v from "valibot";
import { InsecureCookieWarning } from "#/components/insecure-cookie-warning";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { FieldGroup } from "#/components/ui/field";
import { useAppForm } from "#/hooks/form";
import { usePageTitle } from "#/hooks/use-page-title";
import { instanceStatusQueryOptions } from "#/lib/data/instance";
import { toastError } from "#/lib/errors";
import { signUp, startSession } from "../../lib/auth";

const SignUpSchema = v.object({
	email: v.pipe(
		v.string(),
		v.trim(),
		v.toLowerCase(),
		v.email("Enter a valid email address."),
	),
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
	password: v.pipe(
		v.string(),
		v.minLength(10, "Use at least 10 characters."),
		v.maxLength(64, "Use at most 64 characters."),
	),
});

export const Route = createFileRoute("/signup")({
	validateSearch: (search: Record<string, unknown>): { invite?: string } => ({
		invite: typeof search.invite === "string" ? search.invite : undefined,
	}),
	beforeLoad: ({ context, search }) => {
		if (context.user != null) {
			throw search.invite
				? redirect({ to: "/invite/$token", params: { token: search.invite } })
				: redirect({ to: "/" });
		}
	},
	loader: ({ context: { queryClient } }) =>
		queryClient.ensureQueryData(instanceStatusQueryOptions),
	component: SignUp,
});

function SignUp() {
	usePageTitle("Sign up");
	const { invite } = Route.useSearch();
	const { data: status } = useSuspenseQuery(instanceStatusQueryOptions);

	if (!status.needsSetup && !status.signupOpen && !invite) {
		return (
			<div className="flex min-h-dvh w-full items-center justify-center p-4">
				<Card className="w-full max-w-sm">
					<CardHeader>
						<CardTitle>Sign-ups are closed</CardTitle>
						<CardDescription>
							Ask a workspace admin on this instance for an invite link.
						</CardDescription>
					</CardHeader>
					<CardFooter>
						<Link to="/signin" className="underline underline-offset-3">
							Sign in instead
						</Link>
					</CardFooter>
				</Card>
			</div>
		);
	}

	return <SignUpForm invite={invite} needsSetup={status.needsSetup} />;
}

function SignUpForm({
	invite,
	needsSetup,
}: {
	invite?: string;
	needsSetup: boolean;
}) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const form = useAppForm({
		defaultValues: {
			email: "",
			fullName: "",
			displayName: "",
			password: "",
		},
		validators: {
			onSubmit: SignUpSchema,
		},
		onSubmit: async ({ value }) => {
			try {
				await signUp(
					value.email,
					value.fullName,
					value.displayName,
					value.password,
					invite,
				);
				queryClient.removeQueries({
					queryKey: instanceStatusQueryOptions.queryKey,
				});
				await startSession(queryClient);

				if (invite) {
					navigate({ to: "/invite/$token", params: { token: invite } });
				} else {
					navigate({ to: "/create-workspace" });
				}
			} catch (error) {
				toastError(error);
			}
		},
	});

	return (
		<div className="flex min-h-dvh w-full items-center justify-center p-4">
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle>{needsSetup ? "Set up smelp" : "Sign up"}</CardTitle>
					{needsSetup && (
						<CardDescription>
							This first account will be the admin for this instance.
						</CardDescription>
					)}
				</CardHeader>
				<CardContent className="space-y-4">
					<InsecureCookieWarning />
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
								name="fullName"
								children={(field) => (
									<field.TextField label="Full name" autoComplete="name" />
								)}
							/>
							<form.AppField
								name="displayName"
								children={(field) => (
									<field.TextField
										label="Display name"
										autoComplete="nickname"
									/>
								)}
							/>
							<form.AppField
								name="password"
								children={(field) => (
									<field.TextField
										label="Password"
										type="password"
										autoComplete="new-password"
									/>
								)}
							/>
						</FieldGroup>
						<form.AppForm>
							<form.SubscribeButton
								label={needsSetup ? "Create admin account" : "Sign up"}
								className="w-full"
							/>
						</form.AppForm>
					</form>
				</CardContent>
				{!needsSetup && (
					<CardFooter>
						<p>
							Already have an account?{" "}
							<Link
								to="/signin"
								search={{ invite }}
								className="underline underline-offset-3"
							>
								Sign in
							</Link>
						</p>
					</CardFooter>
				)}
			</Card>
		</div>
	);
}
