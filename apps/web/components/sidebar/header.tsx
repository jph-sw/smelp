"use client";

import {
	ChevronDown,
	GearsIcon,
	SearchIcon,
	UserPlus,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { tables } from "@smelp/db";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { Button } from "#/components/ui/button";
import { currentUserQueryOptions, type AuthUser, signOut } from "#/lib/auth";
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
	const router = useRouter();
	const queryClient = useQueryClient();

	const handleSignOut = async () => {
		await signOut();
		await queryClient.fetchQuery(currentUserQueryOptions);
		await router.invalidate();
		navigate({ to: "/signin" });
	};

	return (
		<header className="sticky top-0 z-50 flex w-full items-center bg-sidebar">
			<div className="flex h-(--header-height) w-full items-center gap-2 px-4">
				<div className={"flex-1 shrink-0"}>
					<Popover>
						<PopoverTrigger render={<Button variant="outline" />}>
							{workspace.name} <HugeiconsIcon icon={ChevronDown} />
						</PopoverTrigger>
						<PopoverContent className={"px-0 gap-0"}>
							<div className="px-2 mb-2">
								<span className="text-muted-foreground">{user.email}</span>
							</div>
							<div className="border-b mb-2">
								<div className="flex size-full flex-col items-start justify-start">
									<div className="w-full">
										<div className="px-4 py-2 bg-muted">
											<div className="flex items-center justify-between gap-1 rounded-sm p-1">
												<div className="relative flex w-[80%] items-center justify-start gap-2.5">
													<span className="h-8 w-8 bg-background rounded-md" />
													<div className="w-[inherit]">
														<div className="truncate text-left font-medium text-ellipsis">
															{workspace.name}
														</div>
														<div className="flex w-fit gap-2 capitalize">
															Admin
														</div>
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
												<Button variant={"outline"}>
													<HugeiconsIcon icon={UserPlus} /> Invite members
												</Button>
											</div>
										</div>
									</div>
									{workspaces
										.filter(
											(workspaceItem) => workspaceItem.id !== workspace.id,
										)
										.map((workspaceItem) => (
											<Link
												key={workspace.id}
												to="/$id"
												className="w-full"
												params={{ id: workspaceItem.id }}
											>
												<div className="w-full">
													<div className="px-4 py-2 hover:bg-muted">
														<div className="flex items-center justify-between gap-1 rounded-sm p-1">
															<div className="relative flex w-[80%] items-center justify-start gap-2.5">
																<span className="relative flex h-8 w-8 bg-blue-800 rounded-md" />
																<div className="w-[inherit]">
																	<div className="truncate text-left font-medium text-ellipsis text-secondary-foreground">
																		{workspaceItem.name}
																	</div>
																	<div className="flex w-fit gap-2 capitalize">
																		<span>Admin</span>
																	</div>
																</div>
															</div>
														</div>
													</div>
												</div>
											</Link>
										))}
								</div>
							</div>
							<Button render={<Link to="/create-workspace" />}>
								New workspace
							</Button>
						</PopoverContent>
					</Popover>
				</div>
				<div className="shrink-0">
					<Button variant={"outline"} className={"w-96"}>
						<HugeiconsIcon icon={SearchIcon} />
						Search...
					</Button>
				</div>
				<div className="flex flex-1 shrink-0 items-center justify-end">
					<DropdownMenu>
						<DropdownMenuTrigger
							render={
								<Avatar>
									<AvatarImage src="https://github.com/shadcn.png" />
									<AvatarFallback>CN</AvatarFallback>
								</Avatar>
							}
						></DropdownMenuTrigger>
						<DropdownMenuContent>
							<DropdownMenuGroup>
								<DropdownMenuLabel>My Account</DropdownMenuLabel>
								<DropdownMenuItem>Settings</DropdownMenuItem>
								<DropdownMenuItem>Preferences</DropdownMenuItem>
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
