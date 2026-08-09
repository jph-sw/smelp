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
import { signUp } from "../../lib/auth";

const SignUpSchema = v.object({
	email: v.pipe(v.string(), v.trim(), v.toLowerCase(), v.email()),
	fullName: v.pipe(v.string()),
	displayName: v.pipe(v.string()),
	password: v.pipe(v.string(), v.minLength(10), v.maxLength(64)),
});

export const Route = createFileRoute("/signup")({
	component: SignUp,
});

function SignUp() {
	const navigate = useNavigate();
	const signUpForm = useForm({
		schema: SignUpSchema,
	});

	const handleSubmit: SubmitHandler<typeof SignUpSchema> = async (output) => {
		try {
			await signUp(
				output.email,
				output.fullName,
				output.displayName,
				output.password,
			);
			navigate({ to: "/" });
		} catch (error) {
			if (error instanceof Error) {
				console.log("Form error: ", error);
				setErrors(signUpForm, { errors: [error.message] });
			}
		}
	};

	return (
		<div className="w-full h-dvh flex justify-center items-center">
			<Card className="w-xl">
				<CardHeader>
					<CardTitle>Sign up</CardTitle>
				</CardHeader>
				<CardContent>
					<Form of={signUpForm} id="signup-form" onSubmit={handleSubmit}>
						<FieldGroup>
							<FormischField of={signUpForm} path={["email"]}>
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
							<FormischField of={signUpForm} path={["fullName"]}>
								{(field) => (
									<TextInput
										input={field.input}
										label="Fullname"
										type="text"
										errors={field.errors}
										{...field.props}
									/>
								)}
							</FormischField>
							<FormischField of={signUpForm} path={["displayName"]}>
								{(field) => (
									<TextInput
										input={field.input}
										label="Displayname"
										type="text"
										errors={field.errors}
										{...field.props}
									/>
								)}
							</FormischField>
							<FormischField of={signUpForm} path={["password"]}>
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
							<FormError errors={signUpForm.errors} />
							<Field>
								<Button type="submit" form="signup-form">
									Sign In
								</Button>
							</Field>
						</FieldGroup>
					</Form>
				</CardContent>
				<CardFooter>
					<p>
						Already have an account? <Link to="/signin">Sign in</Link>
					</p>
				</CardFooter>
			</Card>
		</div>
	);
}
