import { Copy01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { copyToClipboard } from "#/components/copy-link";
import { Button } from "#/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { issueBranchName } from "#/lib/issue-branch";

export function CopyItemMenu({
	workspaceId,
	issueId,
	title,
}: {
	workspaceId: string;
	issueId: string;
	title: string;
}) {
	const options = [
		{
			label: "Copy key",
			text: () => issueId,
			copiedMessage: "Key copied.",
		},
		{
			label: "Copy link",
			text: () => `${window.location.origin}/${workspaceId}/browse/${issueId}`,
			copiedMessage: "Link copied.",
		},
		{
			label: "Copy branch name",
			text: () => issueBranchName(issueId, title),
			copiedMessage: "Branch name copied.",
		},
	];

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				aria-label="Copy"
				render={<Button variant="ghost" size="icon-xs" />}
			>
				<HugeiconsIcon icon={Copy01Icon} className="size-3.5" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="min-w-40">
				{options.map(({ label, text, copiedMessage }) => (
					<DropdownMenuItem
						key={label}
						onSelect={() => copyToClipboard(text(), copiedMessage)}
					>
						{label}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
