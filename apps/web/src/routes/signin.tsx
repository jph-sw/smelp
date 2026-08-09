import {
	Form,
	Field as FormischField,
	type SubmitHandler,
	setErrors,
	useForm,
} from "@formisch/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as v from "valibot";
import { FormError } from "#/components/form/form-errror";
import { TextInput } from "#/components/form/text-input";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Field, FieldGroup } from "#/components/ui/field";
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
	const signInForm = useForm({
		schema: SignInSchema,
	});

	const handleSubmit: SubmitHandler<typeof SignInSchema> = async (output) => {
		try {
			await signIn(output.email, output.password);
			navigate({ to: "/" });
		} catch (error) {
			if (error instanceof Error) {
				console.log("Form error: ", error);
				setErrors(signInForm, { errors: [error.message] });
			}
		}
	};

	return (
		<div className="w-full h-dvh flex justify-center items-center">
			<Card className="w-xl">
				<CardHeader>
					<CardTitle>Sign in</CardTitle>
				</CardHeader>
				<CardContent>
					<Form of={signInForm} id="signin-form" onSubmit={handleSubmit}>
						<FieldGroup>
							<FormischField of={signInForm} path={["email"]}>
								{(field) => (
									<TextInput
										input={field.input}
										label="Email"
										type="email"
										errors={field.errors}
										{...field.props}
									/>
								)}
							</FormischField>
							<FormischField of={signInForm} path={["password"]}>
								{(field) => (
									<TextInput
										input={field.input}
										label="Password"
										type="password"
										errors={field.errors}
										{...field.props}
									/>
								)}
							</FormischField>
							<FormError errors={signInForm.errors} />
							<Field>
								<Button type="submit" form="signin-form">
									Sign In
								</Button>
							</Field>
						</FieldGroup>
					</Form>
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
