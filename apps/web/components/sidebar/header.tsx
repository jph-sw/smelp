"use client";

import { ChevronDown, SearchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { tables } from "@smelp/db";
import { Button } from "#/components/ui/button";
import type { AuthUser } from "#/lib/auth";
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
	user,
}: {
	workspace: tables["workspace"];
	user: AuthUser;
}) {
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
								<span>{user.email}</span>
							</div>
							<div className="px-2 py-4 grid gap-2 bg-secondary">
								<span className="text-lg">{workspace.name}</span>
								<div>
									<Button>Settings</Button>
								</div>
							</div>
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
								<DropdownMenuItem>Sign Out</DropdownMenuItem>
							</DropdownMenuGroup>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>
		</header>
	);
}
