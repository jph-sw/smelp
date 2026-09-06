import type { ProjectMember } from "@smelp/db";
import { createColumnHelper } from "@tanstack/react-table";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import type { DataTableFeatures } from "./data-table-features";

const columnHelper = createColumnHelper<DataTableFeatures, ProjectMember>();

export const columns = columnHelper.columns([
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
						<AvatarFallback>
							{displayName.slice(0, 2).toUpperCase()}
						</AvatarFallback>
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
			const date = new Date(row.getValue("createdAt"));

			return date.toDateString();
		},
	}),
]);
