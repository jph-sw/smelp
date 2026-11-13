import {
	AlertDialogBackdrop,
	AlertDialogClose,
	AlertDialogContent as AlertDialogContentPrimitive,
	AlertDialogDescription,
	AlertDialog as AlertDialogPrimitive,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@ui-sdk/react/alert-dialog";
import type * as React from "react";

import { type ButtonVariantProps, buttonData } from "#/components/ui/button";
import { cn } from "#/lib/utils";

function AlertDialog(props: React.ComponentProps<typeof AlertDialogPrimitive>) {
	return <AlertDialogPrimitive {...props} />;
}

function AlertDialogContent({
	className,
	...props
}: React.ComponentProps<typeof AlertDialogContentPrimitive>) {
	return (
		<>
			<AlertDialogBackdrop />
			<AlertDialogContentPrimitive
				className={cn(
					"grid max-h-[calc(100dvh-2rem)] w-full max-w-[min(24rem,calc(100%-2rem))] gap-3 overflow-y-auto",
					className,
				)}
				{...props}
			/>
		</>
	);
}

function AlertDialogHeader({
	className,
	...props
}: React.ComponentProps<"div">) {
	return <div className={cn("flex flex-col gap-1", className)} {...props} />;
}

function AlertDialogFooter({
	className,
	...props
}: React.ComponentProps<"div">) {
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

// The agreeing answer. It closes the dialog with value "confirm", after onClick.
function AlertDialogAction({
	variant = "default",
	size,
	...props
}: React.ComponentProps<typeof AlertDialogClose> & ButtonVariantProps) {
	return (
		<AlertDialogClose
			value="confirm"
			{...buttonData({ variant, size })}
			{...props}
		/>
	);
}

function AlertDialogCancel({
	variant = "outline",
	size,
	...props
}: React.ComponentProps<typeof AlertDialogClose> & ButtonVariantProps) {
	return <AlertDialogClose {...buttonData({ variant, size })} {...props} />;
}

export {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
};
