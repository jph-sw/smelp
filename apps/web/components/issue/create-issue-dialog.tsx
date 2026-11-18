import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";
import {
	type CreateIssueDestination,
	closeCreateIssueDialog,
	useCreateIssueDialogStore,
} from "./create-issue-dialog-store";
import { CreateIssueForm } from "./create-issue-form";

const DESTINATION_LABELS: Record<CreateIssueDestination["kind"], string> = {
	state: "State",
	cycle: "Cycle",
	module: "Module",
};

export function CreateIssueDialog() {
	const state = useCreateIssueDialogStore();
	const [formKey, setFormKey] = useState(0);
	const content = useRef<HTMLDivElement>(null);

	return (
		<Dialog
			open={state.isOpen}
			onOpenChange={(open, details) => {
				// A stray click outside shouldn't throw away a half-written work item.
				if (!open && details.reason === "outside-press") {
					details.cancel();
					return;
				}
				if (!open) closeCreateIssueDialog();
			}}
		>
			<DialogContent ref={content} className="sm:max-w-2xl">
				{state.isOpen && (
					<>
						<DialogHeader>
							<DialogTitle>New work item</DialogTitle>
							<DialogDescription className="[overflow-wrap:anywhere]">
								In {state.params.projectName}
								{state.params.destination &&
									` · ${DESTINATION_LABELS[state.params.destination.kind]}: ${state.params.destination.name}`}
							</DialogDescription>
						</DialogHeader>
						<CreateIssueForm
							key={formKey}
							params={state.params}
							onSuccess={closeCreateIssueDialog}
							onDiscard={() => {
								// Remounting removes the focused button, which would drop focus
								// out of the dialog.
								flushSync(() => setFormKey((key) => key + 1));
								content.current
									?.querySelector<HTMLInputElement>('input[name="title"]')
									?.focus();
							}}
						/>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
