import {
	FileImportIcon,
	People,
	Setting07Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import {
	SettingsNav,
	SettingsNavGroup,
	settingsNavLinkClassName,
} from "#/components/settings/nav";

export const Route = createFileRoute("/(workspace)/$id/settings/workspace")({
	component: RouteComponent,
});

function RouteComponent() {
	const { id: workspaceId } = Route.useParams();

	return (
		<div className="flex h-full w-full flex-col md:flex-row">
			<SettingsNav title="Workspace Settings">
				<SettingsNavGroup label="General">
					<Link
						to="/$id/settings/workspace"
						params={{ id: workspaceId }}
						activeOptions={{ exact: true }}
						className={settingsNavLinkClassName}
					>
						<HugeiconsIcon icon={Setting07Icon} className="size-3.5" />
						General
					</Link>
					<Link
						to="/$id/settings/workspace/members"
						params={{ id: workspaceId }}
						activeOptions={{ exact: true }}
						className={settingsNavLinkClassName}
					>
						<HugeiconsIcon icon={People} className="size-3.5" />
						Members
					</Link>
				</SettingsNavGroup>
				<SettingsNavGroup label="Data">
					<Link
						to="/$id/settings/workspace/import"
						params={{ id: workspaceId }}
						activeOptions={{ exact: true }}
						className={settingsNavLinkClassName}
					>
						<HugeiconsIcon icon={FileImportIcon} className="size-3.5" />
						Import from Jira
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
