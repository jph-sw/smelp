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
			onOpenChange={(open) => {
				if (!open) closeCreateIssueDialog();
			}}
			disablePointerDismissal
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
