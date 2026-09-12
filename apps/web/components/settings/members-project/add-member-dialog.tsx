import { UserAdd01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { Button } from "../../ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "../../ui/dialog";
import { AddMemberForm } from "./add-member-form";

export function AddMemberDialog({ projectId }: { projectId: string }) {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger render={<Button size="sm" />}>
				<HugeiconsIcon icon={UserAdd01Icon} />
				Add member
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add member</DialogTitle>
				</DialogHeader>
				<AddMemberForm
					projectId={projectId}
					onSuccess={() => setIsOpen(false)}
				/>
			</DialogContent>
		</Dialog>
	);
}
