import {
	type ShortcutInfo,
	shortcuts,
	useShortcut,
} from "@ui-sdk/react/shortcuts";
import { useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";

export function KeyboardShortcutsDialog() {
	const [open, setOpen] = useState(false);
	const [listed, setListed] = useState<ShortcutInfo[]>([]);
	useShortcut(
		"shift+?",
		() => {
			// Read before opening: page shortcuts pause under a modal, and list()
			// returns only the ones that can run now.
			setListed(shortcuts.list().filter((shortcut) => shortcut.description));
			setOpen(true);
		},
		{ description: "Show keyboard shortcuts" },
	);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Keyboard shortcuts</DialogTitle>
				</DialogHeader>
				<dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
					{listed.map((shortcut) => (
						<div key={shortcut.keys} className="contents">
							<dt>{shortcut.description}</dt>
							<dd>
								<kbd>{shortcut.hint}</kbd>
							</dd>
						</div>
					))}
				</dl>
			</DialogContent>
		</Dialog>
	);
}
