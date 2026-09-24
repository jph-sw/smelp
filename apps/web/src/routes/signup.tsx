import { ORPCError } from "@orpc/client";
import { useQueryClient } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	redirect,
	useNavigate,
	useRouter,
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
import { toast } from "#/components/ui/toast";
import { useAppForm } from "#/hooks/form";
import { orpc } from "#/lib/orpc";
import { currentUserQueryOptions, signUp } from "../../lib/auth";

const SignUpSchema = v.object({
	email: v.pipe(v.string(), v.trim(), v.toLowerCase(), v.email()),
	fullName: v.pipe(v.string()),
	displayName: v.pipe(v.string()),
	password: v.pipe(v.string(), v.minLength(10), v.maxLength(64)),
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
	const router = useRouter();
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
				await queryClient.fetchQuery(currentUserQueryOptions);
				await router.invalidate();

				const invites = await orpc.workspaceInvites.findMine();
				if (invites.length > 0) {
					navigate({ to: "/invites" });
				} else {
					navigate({ to: "/create-workspace" });
				}
			} catch (error) {
				if (error instanceof ORPCError) {
					toast.add({ type: "error", description: error.message });
					if (error.code === "CONFLICT") {
						form.setErrorMap({
							onSubmit: {
								fields: {
									email: "",
								},
							},
						});
					}
				}
			}
		},
	});

	return (
		<div className="w-full h-dvh flex justify-center items-center">
			<Card className="w-xl">
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
									<field.TextField label="Email" type="email" />
								)}
							/>
							<form.AppField
								name="fullName"
								children={(field) => <field.TextField label="Fullname" />}
							/>
							<form.AppField
								name="displayName"
								children={(field) => <field.TextField label="Displayname" />}
							/>
							<form.AppField
								name="password"
								children={(field) => (
									<field.TextField label="Password" type="password" />
								)}
							/>
						</FieldGroup>
						<form.AppForm>
							<form.SubscribeButton label="Sign Up" />
						</form.AppForm>
					</form>
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
