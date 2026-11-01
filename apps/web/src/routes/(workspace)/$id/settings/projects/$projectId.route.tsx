import { LayerIcon, People, Setting07Icon } from "@hugeicons/core-free-icons";
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
		<div className="flex h-full w-full flex-col md:flex-row">
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
					<Link
						to="/$id/settings/projects/$projectId/states"
						params={params}
						activeOptions={{ exact: true }}
						className={settingsNavLinkClassName}
					>
						<HugeiconsIcon icon={LayerIcon} className="size-3.5" />
						States
					</Link>
				</SettingsNavGroup>
			</SettingsNav>
			<div className="flex min-w-0 flex-1 justify-center overflow-y-auto">
				<div className="w-full max-w-5xl px-4 py-8 sm:px-8">
					<Outlet />
				</div>
			</div>
		</div>
	);
}
