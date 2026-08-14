import { ORPCError } from "@orpc/client";
import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";
import libraryUrl from "#/assets/library.png";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { FieldGroup } from "#/components/ui/field";
import { toast } from "#/components/ui/toast";
import { useAppForm } from "#/hooks/form";
import { orpc } from "#/lib/orpc";

const CreateWorkspaceSchema = v.object({
	name: v.pipe(v.string(), v.minLength(6), v.maxLength(32)),
});

export const Route = createFileRoute("/(workspace)/create-workspace")({
	component: RouteComponent,
});

function RouteComponent() {
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
				toast.add({
					type: "success",
					description: `Workspace "${res.name}" created.`,
				});
			} catch (e) {
				if (e instanceof ORPCError) {
					toast.add({
						type: "error",
						description: e.message,
					});
				}
			}
		},
	});

	return (
		<div className="w-full h-dvh overflow-y-hidden relative">
			<img
				className="absolute w-full h-dvh object-cover"
				src={libraryUrl}
				aria-label="library"
			/>
			<div className="w-full h-dvh absolute">
				<div className="h-full w-full xl:w-1/2 p-12">
					<Card className="h-full bg-card/99 xl:p-32">
						<CardHeader>
							<CardTitle>Create your workspace</CardTitle>
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
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
