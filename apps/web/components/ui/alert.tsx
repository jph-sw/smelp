import type * as React from "react";

import { cn } from "#/lib/utils";

function Alert({
	className,
	variant = "default",
	...props
}: React.ComponentProps<"div"> & { variant?: "default" | "destructive" }) {
	return (
		<div
			role="alert"
			data-variant={variant}
			className={cn(
				"flex flex-col gap-1 rounded-md border p-3 text-sm data-[variant=destructive]:text-destructive",
				className,
			)}
			{...props}
		/>
	);
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={cn("font-medium", className)} {...props} />;
}

function AlertDescription({
	className,
	...props
}: React.ComponentProps<"div">) {
	return <div className={cn("text-muted-foreground", className)} {...props} />;
}

export { Alert, AlertDescription, AlertTitle };
