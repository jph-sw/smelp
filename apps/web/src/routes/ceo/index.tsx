import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Card, CardContent } from "#/components/ui/card";
import { Switch } from "#/components/ui/switch";
import {
	instanceStatusQueryOptions,
	instanceUsersQueryOptions,
	updateInstance,
} from "#/lib/data/instance";
import { toastError } from "#/lib/errors";
import { formatDate, initials } from "#/lib/utils";

export const Route = createFileRoute("/ceo/")({
	component: RouteComponent,
	loader: ({ context: { queryClient } }) =>
		Promise.all([
			queryClient.ensureQueryData(instanceStatusQueryOptions),
			queryClient.ensureQueryData(instanceUsersQueryOptions),
		]),
});

function RouteComponent() {
	const queryClient = useQueryClient();
	const { data: status } = useSuspenseQuery(instanceStatusQueryOptions);
	const { data: users } = useSuspenseQuery(instanceUsersQueryOptions);

	const { mutate: update, isPending } = useMutation({
		mutationFn: updateInstance,
		onError: (e) => toastError(e),
		onSettled: () =>
			queryClient.invalidateQueries({
				queryKey: instanceStatusQueryOptions.queryKey,
			}),
	});

	return (
		<div className="space-y-8">
			<div className="flex items-baseline justify-between gap-4">
				<h1 className="text-xl font-medium">Instance settings</h1>
				<Link to="/" className="underline underline-offset-3">
					Back to smelp
				</Link>
			</div>
			<Card>
				<CardContent className="flex items-center justify-between gap-4">
					<div>
						<h2 id="signup-label" className="text-sm font-semibold">
							Public sign-up
						</h2>
						<p className="text-card-foreground/70">
							When this is off, people can only join with an invite link from a
							workspace admin.
						</p>
					</div>
					<Switch
						aria-labelledby="signup-label"
						checked={status.signupOpen}
						disabled={isPending}
						onCheckedChange={(signupOpen) => update({ signupOpen })}
					/>
				</CardContent>
			</Card>
			<section className="flex flex-col gap-1" aria-labelledby="users-label">
				<h2
					id="users-label"
					className="text-xs font-medium text-muted-foreground"
				>
					Users
				</h2>
				{users.map((user) => (
					<div key={user.id} className="flex items-center gap-3 px-2 py-2">
						<Avatar size="sm">
							<AvatarImage src={user.image ?? undefined} alt="" />
							<AvatarFallback>{initials(user.displayName)}</AvatarFallback>
						</Avatar>
						<div className="flex min-w-0 flex-col">
							<span className="text-sm font-medium [overflow-wrap:anywhere]">
								{user.displayName}
							</span>
							<span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
								{user.email}
							</span>
						</div>
						<span
							className="ml-auto shrink-0 text-xs text-muted-foreground"
							title={`Joined ${formatDate(user.createdAt)}`}
						>
							{user.role === "admin" ? "Instance admin" : "User"}
						</span>
					</div>
				))}
			</section>
		</div>
	);
}
