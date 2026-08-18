import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { projectMembersQueryOptions } from "#/lib/data/project-members";

export const Route = createFileRoute(
	"/(workspace)/$id/settings/projects/$projectId/members",
)({
	component: RouteComponent,
	loader: async ({ context: { queryClient }, params: { projectId } }) => {
		await queryClient.ensureQueryData(
			projectMembersQueryOptions({ projectId }),
		);
	},
});

function RouteComponent() {
	const { projectId } = Route.useParams();
	const { data: members } = useSuspenseQuery(
		projectMembersQueryOptions({ projectId }),
	);

	return (
		<div className="flex flex-col gap-1">
			{members.map((member) => (
				<div
					key={member.id}
					className="flex items-center gap-3 rounded-md px-2 py-2"
				>
					<Avatar size="sm">
						<AvatarImage src={member.image ?? undefined} />
						<AvatarFallback>
							{member.displayName.slice(0, 2).toUpperCase()}
						</AvatarFallback>
					</Avatar>
					<div className="flex flex-col">
						<span className="text-sm font-medium">{member.displayName}</span>
						<span className="text-xs text-muted-foreground">
							{member.email}
						</span>
					</div>
					<span className="ml-auto text-xs text-muted-foreground capitalize">
						{member.role}
					</span>
				</div>
			))}
		</div>
	);
}
