import { ORPCError } from "@orpc/client";
import { useQueryClient } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	redirect,
	useNavigate,
} from "@tanstack/react-router";
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
import { toastError } from "#/lib/errors";
import { orpc } from "#/lib/orpc";
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
	beforeLoad: ({ context }) => {
		if (context.user != null) {
			throw redirect({ to: "/" });
		}
	},
	component: SignUp,
});

function SignUp() {
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
				);
				await startSession(queryClient);

				const invites = await orpc.workspaceInvites.findMine();
				if (invites.length > 0) {
					navigate({ to: "/invites" });
				} else {
					navigate({ to: "/create-workspace" });
				}
			} catch (error) {
				toastError(error);
				if (error instanceof ORPCError && error.code === "CONFLICT") {
					form.setErrorMap({
						onSubmit: {
							fields: {
								email: "",
							},
						},
					});
				}
			}
		},
	});

	return (
		<div className="flex min-h-dvh w-full items-center justify-center p-4">
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle>Sign up</CardTitle>
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
							<form.SubscribeButton label="Sign up" className="w-full" />
						</form.AppForm>
					</form>
				</CardContent>
				<CardFooter>
					<p>
						Already have an account?{" "}
						<Link to="/signin" className="underline underline-offset-3">
							Sign in
						</Link>
					</p>
				</CardFooter>
			</Card>
		</div>
	);
}
