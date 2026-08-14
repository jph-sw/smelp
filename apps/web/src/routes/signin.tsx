import { ORPCError } from "@orpc/client";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as v from "valibot";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { FieldGroup } from "#/components/ui/field";
import { toast } from "#/components/ui/toast";
import { useAppForm } from "#/hooks/form";
import { signIn } from "../../lib/auth";

const SignInSchema = v.object({
	email: v.pipe(v.string(), v.email()),
	password: v.pipe(v.string()),
});

export const Route = createFileRoute("/signin")({
	component: SignIn,
});

function SignIn() {
	const navigate = useNavigate();
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
				navigate({ to: "/" });
			} catch (error) {
				if (error instanceof ORPCError) {
					console.log("Form error: ", error);
					toast.add({ type: "error", description: error.message });
					form.setErrorMap({
						onSubmit: {
							fields: { email: "", password: "" },
						},
					});
				}
			}
		},
	});

	return (
		<div className="w-full h-dvh flex justify-center items-center">
			<Card className="w-xl">
				<CardHeader>
					<CardTitle>Sign in</CardTitle>
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
									<field.TextField label="Email" type="email" />
								)}
							/>
							<form.AppField
								name="password"
								children={(field) => (
									<field.TextField label="Password" type="password" />
								)}
							/>
						</FieldGroup>
						<form.AppForm>
							<form.SubscribeButton label="Sign In" />
						</form.AppForm>
					</form>
				</CardContent>
				<CardFooter>
					<p>
						No account? <Link to="/signup">Sign up</Link>
					</p>
				</CardFooter>
			</Card>
		</div>
	);
}
