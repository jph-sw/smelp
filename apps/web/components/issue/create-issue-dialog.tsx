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
			<DialogContent className="sm:max-w-2xl">
				{state.isOpen && (
					<>
						<DialogHeader>
							<DialogTitle>New work item</DialogTitle>
							<DialogDescription>
								In {state.params.projectName}
							</DialogDescription>
						</DialogHeader>
						<CreateIssueForm
							params={state.params}
							onSuccess={closeCreateIssueDialog}
						/>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
