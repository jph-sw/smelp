import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import * as v from "valibot";
import libraryUrl from "#/assets/library.png";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { FieldGroup } from "#/components/ui/field";
import { toast } from "#/components/ui/toast";
import { VerifyEmailBanner } from "#/components/verify-email-banner";
import { useAppForm } from "#/hooks/form";
import { usePageTitle } from "#/hooks/use-page-title";
import { workspacesQueryOptions } from "#/lib/data/workspace";
import { toastError } from "#/lib/errors";
import { orpc } from "#/lib/orpc";

const CreateWorkspaceSchema = v.object({
	name: v.pipe(
		v.string(),
		v.trim(),
		v.minLength(2, "Use at least 2 characters."),
		v.maxLength(32, "Use at most 32 characters."),
	),
});

export const Route = createFileRoute("/(workspace)/create-workspace")({
	component: RouteComponent,
});

function RouteComponent() {
	usePageTitle("Create workspace");
	const navigate = Route.useNavigate();
	const queryClient = useQueryClient();
	const { user } = Route.useRouteContext();
	const { data: workspaces } = useQuery({
		...workspacesQueryOptions({ userId: user?.id ?? "" }),
		enabled: user != null,
	});

	const isGuest = user?.role === "guest";

	const form = useAppForm({
		defaultValues: {
			name: "",
		},
		validators: {
			onSubmit: CreateWorkspaceSchema,
		},
		onSubmit: async ({ value }) => {
			try {
				const res = await orpc.workspace.create({ name: value.name });
				toast({
					type: "success",
					description: `Workspace "${res.name}" created.`,
				});
				await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
				navigate({ to: "/$id", params: { id: res.id } });
			} catch (e) {
				toastError(e);
			}
		},
	});

	return (
		<div className="w-full h-dvh overflow-y-hidden relative">
			<img
				className="absolute w-full h-dvh object-cover"
				src={libraryUrl}
				alt=""
			/>
			<div className="w-full h-dvh absolute">
				<div className="h-full w-full p-4 sm:p-12 xl:w-1/2">
					<Card className="h-full justify-center bg-card/99 sm:px-8 xl:px-24">
						<CardHeader>
							<CardTitle>
								{isGuest ? "You have a guest account" : "Create your workspace"}
							</CardTitle>
						</CardHeader>
						<CardContent>
							{user?.emailVerificationPending && (
								<div className="mb-4 overflow-hidden rounded-lg">
									<VerifyEmailBanner user={user} />
								</div>
							)}
							{isGuest ? (
								<p className="text-card-foreground/70">
									Guest accounts can't create workspaces. Ask a workspace admin
									for an invite link, and open it to join their workspace.
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
											name="name"
											children={(field) => (
												<field.TextField label="Your workspace name" />
											)}
										/>
									</FieldGroup>
									<form.AppForm>
										<form.SubscribeButton label="Create" />
									</form.AppForm>
								</form>
							)}
						</CardContent>
						{workspaces && workspaces.length > 0 && (
							<CardFooter>
								<Link to="/" className="underline underline-offset-3">
									Back to your workspace
								</Link>
							</CardFooter>
						)}
					</Card>
				</div>
			</div>
		</div>
	);
}
