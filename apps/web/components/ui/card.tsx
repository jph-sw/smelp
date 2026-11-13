import type * as React from "react";

import { cn } from "#/lib/utils";

function Card({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card"
			className={cn("flex flex-col gap-4 rounded-md border p-4", className)}
			{...props}
		/>
	);
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={cn("flex flex-col gap-1", className)} {...props} />;
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={cn("font-medium", className)} {...props} />;
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			className={cn("text-sm text-muted-foreground", className)}
			{...props}
		/>
	);
}

function CardContent(props: React.ComponentProps<"div">) {
	return <div {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={cn("flex items-center", className)} {...props} />;
}

export {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
};
