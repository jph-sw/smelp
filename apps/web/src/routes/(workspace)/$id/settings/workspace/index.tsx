import { useForm } from "@tanstack/react-form";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { useAppForm } from "#/hooks/form";

export const Route = createFileRoute("/(workspace)/$id/settings/workspace/")({
	component: RouteComponent,
});

function RouteComponent() {
	const form = useAppForm({
		defaultValues: {
			name: "",
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
				<Card>
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
