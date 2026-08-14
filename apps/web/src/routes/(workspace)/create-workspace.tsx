import {
	Form,
	Field as FormischField,
	type SubmitHandler,
	useForm,
} from "@formisch/react";
import { ORPCError } from "@orpc/client";
import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";
import libraryUrl from "#/assets/library.png";
import { FormError } from "#/components/form/form-errror";
import { TextInput } from "#/components/form/text-input";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Field, FieldGroup } from "#/components/ui/field";
import { toast } from "#/components/ui/toast";
import { orpc } from "#/lib/orpc";

const CreateWorkspaceSchema = v.object({
	name: v.pipe(v.string(), v.minLength(6), v.maxLength(32)),
});

export const Route = createFileRoute("/(workspace)/create-workspace")({
	component: RouteComponent,
});

function RouteComponent() {
	const createWorkspaceForm = useForm({ schema: CreateWorkspaceSchema });

	const handleSubmit: SubmitHandler<typeof CreateWorkspaceSchema> = async (
		output,
	) => {
		try {
			const res = await orpc.workspace.create({ name: output.name });
			toast.add({
				type: "success",
				description: `Workspace "${res.name}" created.`,
			});
		} catch (e) {
			if (e instanceof ORPCError) {
				console.log(e);
				toast.add({
					type: "error",
					description: e.message,
				});
			}
		}
	};

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
							<Form
								of={createWorkspaceForm}
								id="create-workspace-form"
								onSubmit={handleSubmit}
							>
								<FieldGroup>
									<FormischField of={createWorkspaceForm} path={["name"]}>
										{(field) => (
											<TextInput
												input={field.input}
												label="Your workspace name"
												type="text"
												errors={field.errors}
												{...field.props}
											/>
										)}
									</FormischField>
									<FormError errors={createWorkspaceForm.errors} />
									<Field orientation="horizontal">
										<Button type="submit" form="create-workspace-form">
											Create
										</Button>
									</Field>
								</FieldGroup>
							</Form>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
