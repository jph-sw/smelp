import type { ProjectMember } from "@smelp/db";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useState } from "react";
import { createModule, updateModule } from "#/lib/data/module";
import { toastError } from "#/lib/errors";
import { Button } from "../ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../ui/select";
import { Textarea } from "../ui/textarea";

const NO_LEAD = "none";

type EditableModule = {
	id: string;
	name: string;
	description: string;
	leadId: string | null;
	targetDate: string | null;
};

// Creates a module, or edits the one it is given.
export function ModuleDialog({
	projectId,
	members,
	existing,
	trigger,
	onSaved,
}: {
	projectId: string;
	members: ProjectMember[];
	existing?: EditableModule;
	trigger: ReactElement;
	onSaved?: (moduleId: string) => void;
}) {
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [name, setName] = useState(existing?.name ?? "");
	const [description, setDescription] = useState(existing?.description ?? "");
	const [leadId, setLeadId] = useState(existing?.leadId ?? NO_LEAD);
	const [targetDate, setTargetDate] = useState(existing?.targetDate ?? "");

	const leadItems = [
		{ label: "No lead", value: NO_LEAD },
		...members.map((member) => ({
			label: member.displayName,
			value: member.userId,
		})),
	];
	// A lead who has since left the project isn't offered; saving clears them.
	const shownLead = leadItems.some((item) => item.value === leadId)
		? leadId
		: NO_LEAD;

	const { mutate, isPending } = useMutation({
		mutationFn: () => {
			const fields = {
				name: name.trim(),
				description,
				leadId: shownLead === NO_LEAD ? null : shownLead,
				targetDate: targetDate || null,
			};
			return existing
				? updateModule({ id: existing.id, ...fields })
				: createModule({ projectId, ...fields });
		},
		onSuccess: (saved) => {
			setOpen(false);
			if (!existing) {
				setName("");
				setDescription("");
				setLeadId(NO_LEAD);
				setTargetDate("");
			}
			onSaved?.(saved.id);
		},
		onError: (e) => toastError(e, "Couldn't save the module."),
		onSettled: () =>
			Promise.all([
				queryClient.invalidateQueries({ queryKey: ["modules", projectId] }),
				queryClient.invalidateQueries({ queryKey: ["module"] }),
				queryClient.invalidateQueries({ queryKey: ["activity"] }),
			]),
	});

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				// Opening starts from what is saved, not from an edit that was cancelled.
				if (next && existing) {
					setName(existing.name);
					setDescription(existing.description);
					setLeadId(existing.leadId ?? NO_LEAD);
					setTargetDate(existing.targetDate ?? "");
				}
				setOpen(next);
			}}
		>
			<DialogTrigger render={trigger} />
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{existing ? "Edit module" : "New module"}</DialogTitle>
				</DialogHeader>
				<form
					className="flex flex-col gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						if (name.trim()) mutate();
					}}
				>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="module-name">Name</Label>
						<Input
							id="module-name"
							required
							maxLength={80}
							value={name}
							onChange={(event) => setName(event.target.value)}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="module-description">Description</Label>
						<Textarea
							id="module-description"
							maxLength={2000}
							value={description}
							onChange={(event) => setDescription(event.target.value)}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<span className="text-sm font-medium">Lead</span>
						<Select
							items={leadItems}
							value={shownLead}
							onValueChange={(next) => next != null && setLeadId(next)}
						>
							<SelectTrigger aria-label="Lead" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{leadItems.map((item) => (
									<SelectItem key={item.value} value={item.value}>
										{item.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="module-target-date">Target date</Label>
						<Input
							id="module-target-date"
							type="date"
							value={targetDate}
							onChange={(event) => setTargetDate(event.target.value)}
						/>
					</div>
					<DialogFooter>
						<Button type="submit" disabled={!name.trim() || isPending}>
							{existing ? "Save module" : "Create module"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
