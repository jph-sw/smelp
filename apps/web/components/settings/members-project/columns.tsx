import { Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ProjectMember } from "@smelp/db";
import { createColumnHelper } from "@tanstack/react-table";
import { useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "#/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Button } from "#/components/ui/button";
import { formatDate, initials } from "#/lib/utils";
import type { DataTableFeatures } from "./data-table-features";

const columnHelper = createColumnHelper<DataTableFeatures, ProjectMember>();

function RemoveMemberCell({
	member,
	onRemove,
}: {
	member: ProjectMember;
	onRemove: (member: ProjectMember) => Promise<void>;
}) {
	const [isOpen, setIsOpen] = useState(false);
	const [isRemoving, setIsRemoving] = useState(false);

	const handleRemove = async () => {
		setIsRemoving(true);
		try {
			await onRemove(member);
			setIsOpen(false);
		} finally {
			setIsRemoving(false);
		}
	};

	return (
		<AlertDialog open={isOpen} onOpenChange={setIsOpen}>
			<AlertDialogTrigger
				render={<Button variant="ghost" size="icon" />}
				aria-label="Remove member"
			>
				<HugeiconsIcon icon={Delete02Icon} />
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Remove {member.fullName}?</AlertDialogTitle>
					<AlertDialogDescription>
						This will remove {member.fullName} from the project. They will lose
						access immediately. This action cannot be undone.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={isRemoving}>Cancel</AlertDialogCancel>
					<AlertDialogAction
						variant="destructive"
						disabled={isRemoving}
						onClick={handleRemove}
					>
						Remove member
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

// Members of an archived project can't be added or removed until it is unarchived.
export function canManageMembers({
	isArchived,
	instanceRole,
	projectRole,
}: {
	isArchived: boolean;
	instanceRole: string | null | undefined;
	projectRole: ProjectMember["role"] | undefined;
}) {
	return !isArchived && (instanceRole === "admin" || projectRole === "admin");
}

export function createColumns({
	canRemove,
	onRemove,
}: {
	canRemove: boolean;
	onRemove: (member: ProjectMember) => Promise<void>;
}) {
	return columnHelper.columns([
		columnHelper.accessor("fullName", {
			header: "Full name",
			cell: ({ row }) => {
				const displayName: string = row.getValue("displayName");
				const fullName: string = row.getValue("fullName");
				const image: string = row.getValue("image");
				return (
					<div className="flex items-center gap-3">
						<Avatar size="sm">
							<AvatarImage src={image ?? undefined} />
							<AvatarFallback>{initials(displayName)}</AvatarFallback>
						</Avatar>
						<span>{fullName}</span>
					</div>
				);
			},
		}),
		columnHelper.accessor("displayName", {
			header: "Display name",
		}),
		columnHelper.accessor("email", {
			header: "Email",
		}),
		columnHelper.accessor("role", {
			header: "Role",
			cell: ({ row }) => {
				const role: string = row.getValue("role");

				return <span className="capitalize">{role}</span>;
			},
		}),
		columnHelper.accessor("createdAt", {
			header: "Joining date",
			cell: ({ row }) => {
				return formatDate(row.getValue("createdAt"));
			},
		}),
		...(canRemove
			? [
					columnHelper.display({
						id: "actions",
						header: "",
						cell: ({ row }) => (
							<div className="flex justify-end">
								<RemoveMemberCell member={row.original} onRemove={onRemove} />
							</div>
						),
					}),
				]
			: []),
	]);
}
