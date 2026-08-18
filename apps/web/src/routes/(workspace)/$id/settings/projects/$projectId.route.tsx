import { People, Setting07Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import {
	SettingsNav,
	SettingsNavGroup,
	settingsNavLinkClassName,
} from "#/components/settings/nav";

export const Route = createFileRoute(
	"/(workspace)/$id/settings/projects/$projectId",
)({
	component: RouteComponent,
});

function RouteComponent() {
	const { id: workspaceId, projectId } = Route.useParams();
	const params = { id: workspaceId, projectId };

	return (
		<div className="flex h-full w-full">
			<SettingsNav title="Project Settings">
				<SettingsNavGroup label="General">
					<Link
						to="/$id/settings/projects/$projectId"
						params={params}
						activeOptions={{ exact: true }}
						className={settingsNavLinkClassName}
					>
						<HugeiconsIcon icon={Setting07Icon} className="size-3.5" />
						General
					</Link>
					<Link
						to="/$id/settings/projects/$projectId/members"
						params={params}
						activeOptions={{ exact: true }}
						className={settingsNavLinkClassName}
					>
						<HugeiconsIcon icon={People} className="size-3.5" />
						Members
					</Link>
				</SettingsNavGroup>
			</SettingsNav>
			<div className="flex justify-center w-full">
				<div className="w-5xl py-8">
					<Outlet />
				</div>
			</div>
		</div>
	);
}
