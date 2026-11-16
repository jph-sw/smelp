import { ChevronDown, GearsIcon, UserPlus } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { tables } from "@smelp/db";
import {
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { SidebarTrigger } from "#/components/ui/sidebar";
import { type AuthUser, endSession, signOut } from "#/lib/auth";
import { instanceStatusQueryOptions } from "#/lib/data/instance";
import { workspacesQueryOptions } from "#/lib/data/workspace";
import { toastError } from "#/lib/errors";
import { initials } from "#/lib/utils";
import { useWorkspaceAccess } from "#/lib/workspace-viewer";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { HeaderSearch } from "./header-search";
import { NotificationsMenu } from "./notifications-menu";

export function SiteHeader({ workspace }: { workspace: tables["workspace"] }) {
	const { viewer, canManage } = useWorkspaceAccess();
	const isPublic = viewer.mode === "public";

	return (
		<header className="sticky top-0 z-50 flex w-full items-center bg-sidebar pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
			<div className="flex h-(--header-height) w-full items-center gap-2 px-4 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,28rem)_minmax(0,1fr)] md:gap-4">
				<div className="flex min-w-0 max-w-[45%] shrink-0 items-center gap-1 md:max-w-none">
					<SidebarTrigger className="md:hidden" />
					{viewer.user ? (
						<WorkspaceSwitcher
							workspace={workspace}
							user={viewer.user}
							showSettings={!isPublic}
							canManage={canManage}
						/>
					) : (
						<span className="truncate px-2 font-medium">{workspace.name}</span>
					)}
				</div>
				{isPublic ? (
					<p className="min-w-0 flex-1 truncate text-center text-xs text-muted-foreground">
						Public · read only
					</p>
				) : (
					<HeaderSearch workspaceId={workspace.id} />
				)}
				<div className="flex shrink-0 items-center justify-end gap-1">
					{!isPublic && <NotificationsMenu workspaceId={workspace.id} />}
					{viewer.user ? <UserMenu user={viewer.user} /> : <SignInLinks />}
				</div>
			</div>
		</header>
	);
}

function WorkspaceSwitcher({
	workspace,
	user,
	showSettings,
	canManage,
}: {
	workspace: tables["workspace"];
	user: AuthUser;
	showSettings: boolean;
	canManage: boolean;
}) {
	const [isOpen, setIsOpen] = useState(false);
	const { data: workspaces } = useSuspenseQuery(
		workspacesQueryOptions({ userId: user.id }),
	);

	return (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
			<PopoverTrigger
				render={<Button variant="outline" className="min-w-0 shrink" />}
			>
				<span className="truncate">{workspace.name}</span>
				<HugeiconsIcon icon={ChevronDown} />
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className={"gap-0 px-0"}
				onClick={(event) => {
					if ((event.target as HTMLElement).closest("a")) {
						setIsOpen(false);
					}
				}}
			>
				<div className="mb-2 truncate px-4 text-muted-foreground">
					{user.email}
				</div>
				<div className="border-b mb-2">
					<div className="flex size-full flex-col items-start justify-start">
						<div className="w-full">
							<div className="px-4 py-2 bg-muted">
								<div className="flex items-center justify-between gap-1 rounded-sm p-1">
									<div className="relative flex w-full items-center justify-start gap-2.5">
										<span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-background font-medium">
											{initials(workspace.name)}
										</span>
										<div className="truncate text-left font-medium">
											{workspace.name}
										</div>
									</div>
								</div>
								{showSettings && (
									<div className="mt-2 mb-1 flex gap-2">
										<Button
											variant={"outline"}
											render={
												<Link
													to="/$id/settings/workspace"
													params={{ id: workspace.id }}
												/>
											}
										>
											<HugeiconsIcon icon={GearsIcon} /> Settings
										</Button>
										{canManage && (
											<Button
												variant={"outline"}
												render={
													<Link
														to="/$id/settings/workspace/members"
														params={{ id: workspace.id }}
													/>
												}
											>
												<HugeiconsIcon icon={UserPlus} /> Invite members
											</Button>
										)}
									</div>
								)}
							</div>
						</div>
						{workspaces
							.filter((workspaceItem) => workspaceItem.id !== workspace.id)
							.map((workspaceItem) => (
								<Link
									key={workspaceItem.id}
									to="/$id"
									className="w-full"
									params={{ id: workspaceItem.id }}
								>
									<div className="w-full">
										<div className="px-4 py-2 transition-colors duration-150 hover:bg-muted">
											<div className="flex items-center justify-between gap-1 rounded-sm p-1">
												<div className="relative flex w-full items-center justify-start gap-2.5">
													<span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary font-medium">
														{initials(workspaceItem.name)}
													</span>
													<div className="truncate text-left font-medium text-secondary-foreground">
														{workspaceItem.name}
													</div>
												</div>
											</div>
										</div>
									</div>
								</Link>
							))}
					</div>
				</div>
				<div className="px-2">
					<Button
						variant="ghost"
						className="w-full"
						render={<Link to="/create-workspace" />}
					>
						New workspace
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}

function UserMenu({ user }: { user: AuthUser }) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	const handleSignOut = async () => {
		try {
			await signOut();
			await endSession(queryClient, () => navigate({ to: "/signin" }));
		} catch (e) {
			toastError(e);
		}
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				aria-label="Account menu"
				render={
					<Button variant="ghost" size="icon-lg" className="rounded-full p-0" />
				}
			>
				<Avatar>
					<AvatarImage src={user.image ?? undefined} alt="" />
					<AvatarFallback>{initials(user.displayName)}</AvatarFallback>
				</Avatar>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-auto min-w-40">
				<DropdownMenuGroup>
					<DropdownMenuLabel>{user.displayName}</DropdownMenuLabel>
					<DropdownMenuItem render={<Link to="/account" />}>
						Account
					</DropdownMenuItem>
					{user.role === "admin" && (
						<DropdownMenuItem render={<Link to="/ceo" />}>
							Instance settings
						</DropdownMenuItem>
					)}
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem onSelect={handleSignOut}>Sign Out</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function SignInLinks() {
	const href = useLocation({ select: (location) => location.href });
	const { data: status } = useQuery(instanceStatusQueryOptions);

	return (
		<>
			{status?.signupOpen && (
				<Button variant="ghost" render={<Link to="/signup" />}>
					Sign up
				</Button>
			)}
			<Button render={<Link to="/signin" search={{ redirect: href }} />}>
				Sign in
			</Button>
		</>
	);
}
