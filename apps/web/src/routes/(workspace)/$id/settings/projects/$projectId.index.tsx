import { createFileRoute } from "@tanstack/react-router";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { Separator } from "#/components/ui/separator";

export const Route = createFileRoute(
	"/(workspace)/$id/settings/projects/$projectId/",
)({
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<div>
			{" "}
			<Card>
				<CardContent>
					<div className="w-full grid grid-cols-3">
						<div className="col-span-2">
							<h3 className="text-md font-semibold">Archive</h3>
							<p className="text-card-foreground/70">
								Archiving a project will unlist your project from your side
								navigation although you will still be able to access it from
								your projects page. You can restore the project or delete it
								whenever you want.
							</p>
						</div>
						<div className="items-center flex ms-auto">
							<Button variant={"destructive"}>Delete</Button>
						</div>
					</div>
					<Separator className={"my-4"} />
					<div className="w-full grid grid-cols-3">
						<div className="col-span-2">
							<h3 className="text-md font-semibold">Delete this project</h3>
							<p className="text-card-foreground/70">
								When deleting a project, all of the data and resources within
								that project will be permanently removed and cannot be
								recovered.
							</p>
						</div>
						<div className="items-center flex ms-auto">
							<Button variant={"destructive"}>Delete</Button>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
