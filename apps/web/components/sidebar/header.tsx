import { ChevronDown, GearsIcon, UserPlus } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { tables } from "@smelp/db";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { SidebarTrigger } from "#/components/ui/sidebar";
import { type AuthUser, endSession, signOut } from "#/lib/auth";
import { useWorkspaceAccess } from "#/lib/data/workspace-members";
import { toastError } from "#/lib/errors";
import { initials } from "#/lib/utils";
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

export function SiteHeader({
	workspace,
	workspaces,
	user,
}: {
	workspace: tables["workspace"];
	workspaces: tables["workspace"][];
	user: AuthUser;
}) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
	const { canManage } = useWorkspaceAccess(workspace.id);

	const handleSignOut = async () => {
		try {
			await signOut();
			await endSession(queryClient, () => navigate({ to: "/signin" }));
		} catch (e) {
			toastError(e);
		}
	};

	return (
		<header className="sticky top-0 z-50 flex w-full items-center bg-sidebar">
			<div className="flex h-(--header-height) w-full items-center gap-2 px-4">
				<div className="flex min-w-0 flex-1 items-center gap-1">
					<SidebarTrigger className="md:hidden" />
					<Popover open={isSwitcherOpen} onOpenChange={setIsSwitcherOpen}>
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
									setIsSwitcherOpen(false);
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
										</div>
									</div>
									{workspaces
										.filter(
											(workspaceItem) => workspaceItem.id !== workspace.id,
										)
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
				</div>
				<div className="flex shrink-0 items-center justify-end">
					<DropdownMenu>
						<DropdownMenuTrigger
							aria-label="Account menu"
							render={
								<Button
									variant="ghost"
									size="icon-lg"
									className="rounded-full p-0"
								/>
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
								<DropdownMenuItem onClick={handleSignOut}>
									Sign Out
								</DropdownMenuItem>
							</DropdownMenuGroup>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>
		</header>
	);
}
