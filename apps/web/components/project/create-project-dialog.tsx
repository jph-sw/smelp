import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { tables } from "@smelp/db";
import { useState } from "react";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogTrigger } from "../ui/dialog";
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
				render={
					<Button
						className={"hidden group-hover/collapsible:flex"}
						variant={"ghost"}
						size={"icon-xs"}
					/>
				}
			>
				<HugeiconsIcon icon={PlusSignIcon} />
			</DialogTrigger>
			<DialogContent className={"min-w-2xl p-0"}>
				<div className="w-full h-40 bg-secondary rounded-t-xl rounded-b-lg" />
				<div className="p-4">
					<CreateProjectForm
						workspace={workspace}
						onSuccess={() => setIsOpen(false)}
					/>
				</div>
			</DialogContent>
		</Dialog>
	);
}
