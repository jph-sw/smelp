import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { createCycle, invalidateCycles } from "#/lib/data/cycle";
import { toastError } from "#/lib/errors";
import { Button } from "../ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "../ui/dialog";
import { toast } from "../ui/toast";
import { CycleForm, type CycleValues } from "./cycle-form";

export function CreateCycleDialog({
	projectId,
	title,
	variant,
	initial,
	children,
}: {
	projectId: string;
	title: string;
	variant?: "outline";
	initial?: CycleValues;
	children: ReactNode;
}) {
	const queryClient = useQueryClient();
	const [isOpen, setIsOpen] = useState(false);

	const { mutate: create, isPending } = useMutation({
		mutationFn: createCycle,
		onSuccess: async (_, { name }) => {
			setIsOpen(false);
			toast({ type: "success", description: `Created ${name}.` });
			await invalidateCycles(queryClient, projectId);
		},
		onError: (error) => toastError(error, "Couldn't create the cycle."),
	});

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger render={<Button variant={variant} />}>
				{children}
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
				</DialogHeader>
				<CycleForm
					initial={initial}
					submitLabel="Create cycle"
					isPending={isPending}
					onSubmit={(values) => create({ projectId, ...values })}
				/>
			</DialogContent>
		</Dialog>
	);
}
