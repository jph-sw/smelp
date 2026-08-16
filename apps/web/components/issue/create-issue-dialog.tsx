import { Dialog, DialogContent } from "../ui/dialog";
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
			onOpenChange={(open) => {
				if (!open) closeCreateIssueDialog();
			}}
			disablePointerDismissal
		>
			<DialogContent className={"min-w-2xl p-4"}>
				{state.isOpen && (
					<CreateIssueForm
						params={state.params}
						onSuccess={closeCreateIssueDialog}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}
