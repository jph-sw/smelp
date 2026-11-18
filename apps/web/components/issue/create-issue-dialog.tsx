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
	closeCreateIssueDialog,
	useCreateIssueDialogStore,
} from "./create-issue-dialog-store";
import { CreateIssueForm } from "./create-issue-form";

export function CreateIssueDialog() {
	const state = useCreateIssueDialogStore();
	const [formKey, setFormKey] = useState(0);
	const [createAnother, setCreateAnother] = useState(false);
	const content = useRef<HTMLDivElement>(null);

	const resetForm = () => {
		// Remounting removes the focused control, which would drop focus out of
		// the dialog.
		flushSync(() => setFormKey((key) => key + 1));
		content.current
			?.querySelector<HTMLInputElement>('input[name="title"]')
			?.focus();
	};

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
							<DialogDescription>
								In {state.params.projectName}
							</DialogDescription>
						</DialogHeader>
						<CreateIssueForm
							key={formKey}
							params={state.params}
							createAnother={createAnother}
							onCreateAnotherChange={setCreateAnother}
							onSuccess={createAnother ? resetForm : closeCreateIssueDialog}
							onDiscard={resetForm}
						/>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
