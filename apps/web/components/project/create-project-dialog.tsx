import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { tables } from "@smelp/db";
import { useState } from "react";
import { Button } from "../ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "../ui/dialog";
import { CreateProjectForm } from "./create-project-form";

export function CreateProjectDialog({
	workspace,
}: {
	workspace: tables["workspace"];
}) {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger
				aria-label="New project"
				render={
					<Button
						className="opacity-0 group-hover/collapsible:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
						variant={"ghost"}
						size={"icon-sm"}
					/>
				}
			>
				<HugeiconsIcon icon={PlusSignIcon} />
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>New project</DialogTitle>
				</DialogHeader>
				<CreateProjectForm
					workspace={workspace}
					onSuccess={() => setIsOpen(false)}
				/>
			</DialogContent>
		</Dialog>
	);
}
