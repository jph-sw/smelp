import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { usePageTitle } from "#/hooks/use-page-title";
import {
	instanceStatusQueryOptions,
	publicWorkspacesQueryOptions,
} from "#/lib/data/instance";
import { workspacesQueryOptions } from "#/lib/data/workspace";
import { initials } from "#/lib/utils";

export const Route = createFileRoute("/")({
	loader: async ({ context: { queryClient, user } }) => {
		if (user == null) {
			const [publicWorkspaces] = await Promise.all([
				queryClient.ensureQueryData(publicWorkspacesQueryOptions),
				queryClient.ensureQueryData(instanceStatusQueryOptions),
			]);
			if (publicWorkspaces.length === 0) throw redirect({ to: "/signin" });
			return;
		}

		const workspaces = await queryClient.ensureQueryData(
			workspacesQueryOptions({ userId: user.id }),
		);

		if (workspaces.length > 0) {
			throw redirect({ to: "/$id", params: { id: workspaces[0].id } });
		}

		throw redirect({ to: "/create-workspace" });
	},
	component: PublicWorkspaces,
});

function PublicWorkspaces() {
	usePageTitle("Public workspaces");
	const { data: workspaces } = useSuspenseQuery(publicWorkspacesQueryOptions);
	const { data: status } = useSuspenseQuery(instanceStatusQueryOptions);

	return (
		<div className="flex min-h-dvh w-full items-center justify-center p-4">
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle>Public workspaces</CardTitle>
					<CardDescription>
						Read what these workspaces share, without an account.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ul className="-mx-2">
						{workspaces.map((workspace) => (
							<li key={workspace.id}>
								<Link
									to="/$id"
									params={{ id: workspace.id }}
									className="flex items-center gap-2.5 rounded-md p-2 transition-colors duration-150 hover:bg-muted"
								>
									<span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary font-medium">
										{initials(workspace.name)}
									</span>
									<span className="truncate font-medium">{workspace.name}</span>
								</Link>
							</li>
						))}
					</ul>
				</CardContent>
				<CardFooter className="flex-wrap gap-x-1">
					<span>Have an account?</span>
					<Link to="/signin" className="underline underline-offset-3">
						Sign in
					</Link>
					{status.signupOpen && (
						<>
							<span>or</span>
							<Link to="/signup" className="underline underline-offset-3">
								sign up
							</Link>
						</>
					)}
				</CardFooter>
			</Card>
		</div>
	);
}
