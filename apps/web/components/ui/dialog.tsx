import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	DialogBackdrop,
	DialogClose,
	DialogContent as DialogContentPrimitive,
	DialogDescription,
	Dialog as DialogPrimitive,
	DialogTitle,
	DialogTrigger,
} from "@ui-sdk/react/dialog";
import type * as React from "react";

import { cn } from "#/lib/utils";

function Dialog(props: React.ComponentProps<typeof DialogPrimitive>) {
	return <DialogPrimitive {...props} />;
}

function DialogContent({
	className,
	children,
	showCloseButton = true,
	...props
}: Omit<React.ComponentProps<typeof DialogContentPrimitive>, "children"> & {
	children?: React.ReactNode;
} & {
	showCloseButton?: boolean;
}) {
	return (
		<>
			<DialogBackdrop />
			<DialogContentPrimitive
				className={cn(
					"grid max-h-[calc(100dvh-2rem)] w-full max-w-[calc(100%-2rem)] gap-4 overflow-y-auto sm:max-w-sm",
					className,
				)}
				{...props}
			>
				{children}
				{showCloseButton && (
					<DialogClose aria-label="Close" className="absolute top-2 right-2">
						<HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
					</DialogClose>
				)}
			</DialogContentPrimitive>
		</>
	);
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={cn("flex flex-col gap-1", className)} {...props} />;
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
				className,
			)}
			{...props}
		/>
	);
}

export {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
};
