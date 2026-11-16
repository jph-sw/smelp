import { RichTextEditor } from "../rich-text/rich-text-editor";

// Edited in place, like the title: leaving it saves, and Escape throws the edit
// away. Uploads go to this work item.
export function IssueDescription({
	issueId,
	value,
	canWrite,
	onSave,
}: {
	issueId: string;
	value: string;
	canWrite: boolean;
	onSave: (value: string) => void;
}) {
	if (!canWrite) {
		return value ? (
			<RichTextEditor
				value={value}
				editable={false}
				aria-label="Description"
				className="max-w-prose"
			/>
		) : (
			<p className="text-sm text-muted-foreground">No description.</p>
		);
	}

	return (
		<div className="-ml-1 max-w-prose space-y-1">
			<RichTextEditor
				value={value}
				issueId={issueId}
				aria-label="Description"
				placeholder="Add a description"
				className="rounded-sm px-1 py-0.5 hover:bg-accent/40 has-[:focus]:bg-transparent"
				onCommit={onSave}
			/>
			<p className="px-1 text-xs text-muted-foreground">Type / for commands</p>
		</div>
	);
}
