import {
	FieldDescription,
	FieldError as FieldErrorPrimitive,
	FieldLabel,
	Field as FieldPrimitive,
} from "@ui-sdk/react/field";
import type * as React from "react";

import { cn } from "#/lib/utils";

function Field({
	className,
	...props
}: React.ComponentProps<typeof FieldPrimitive>) {
	return (
		<FieldPrimitive
			className={cn("flex flex-col gap-1.5", className)}
			{...props}
		/>
	);
}

function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={cn("flex flex-col gap-4", className)} {...props} />;
}

// Shows the form library's messages; the Field's `invalid` decides when.
function FieldError({
	errors,
	children,
	...props
}: React.ComponentProps<typeof FieldErrorPrimitive> & {
	errors?: Array<{ message?: string } | undefined>;
}) {
	const messages = [
		...new Set((errors ?? []).map((error) => error?.message).filter(Boolean)),
	];
	const content =
		children ??
		(messages.length > 1 ? (
			<ul className="ml-4 list-disc">
				{messages.map((message) => (
					<li key={message}>{message}</li>
				))}
			</ul>
		) : (
			messages[0]
		));
	if (!content) return null;
	return (
		<FieldErrorPrimitive match {...props}>
			{content}
		</FieldErrorPrimitive>
	);
}

export { Field, FieldDescription, FieldError, FieldGroup, FieldLabel };
