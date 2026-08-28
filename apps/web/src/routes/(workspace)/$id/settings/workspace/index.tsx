import { ORPCError } from "@orpc/client";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { toast } from "#/components/ui/toast";
import { useAppForm } from "#/hooks/form";
import { updateWorkspace, workspaceQueryOptions } from "#/lib/data/workspace";

const UpdateWorkspaceSchema = v.object({
	name: v.pipe(v.string(), v.minLength(6), v.maxLength(32)),
});

export const Route = createFileRoute("/(workspace)/$id/settings/workspace/")({
	component: RouteComponent,
});

function RouteComponent() {
	const { id: workspaceId } = Route.useParams();
	const queryClient = useQueryClient();
	const workspaceQuery = workspaceQueryOptions({ workspaceId });
	const { data: workspace } = useSuspenseQuery(workspaceQuery);

	const form = useAppForm({
		defaultValues: {
			name: workspace.name,
		},
		validators: {
			onSubmit: UpdateWorkspaceSchema,
		},
		onSubmit: async ({ value }) => {
			try {
				await updateWorkspace({ workspaceId, name: value.name });
				await queryClient.invalidateQueries({
					queryKey: workspaceQuery.queryKey,
				});
				toast.add({
					type: "success",
					description: "Workspace updated.",
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
		<div className="flex justify-center w-full">
			<div className="w-5xl py-8 space-y-6">
				<div className="">
					<div className="space-y-4">
						<form
							onSubmit={(e) => {
								e.preventDefault();
								form.handleSubmit();
							}}
							className="grid grid-cols-3"
						>
							<form.AppField
								name="name"
								children={(field) => <field.TextField label="Workspace name" />}
							/>
						</form>
						<form.AppForm>
							<form.SubscribeButton label="Update workspace" />
						</form.AppForm>
					</div>
				</div>
				<Card className="mt-48">
					<CardContent>
						<div className="w-full flex justify-between">
							<div>
								<h3 className="text-md font-semibold">Delete this workspace</h3>
								<p className="text-card-foreground/70">
									When deleting a workspace, all of the data and resources
									within that workspace will be permanently removed and cannot
									be recovered.
								</p>
							</div>
							<div className="items-center flex">
								<Button variant={"destructive"}>Delete</Button>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
