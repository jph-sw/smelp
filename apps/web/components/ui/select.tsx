import {
	SelectContent as SelectContentPrimitive,
	SelectGroup,
	SelectGroupLabel,
	SelectItemIndicator,
	SelectItem as SelectItemPrimitive,
	Select as SelectPrimitive,
	SelectSeparator,
	SelectTrigger as SelectTriggerPrimitive,
	SelectValue,
} from "@ui-sdk/react/select";
import type * as React from "react";

import { cn } from "#/lib/utils";

function Select<T>(props: React.ComponentProps<typeof SelectPrimitive<T>>) {
	return <SelectPrimitive<T> {...props} />;
}

function SelectTrigger({
	className,
	...props
}: React.ComponentProps<typeof SelectTriggerPrimitive>) {
	return (
		<SelectTriggerPrimitive
			className={cn("justify-between gap-2", className)}
			{...props}
		/>
	);
}

function SelectContent(
	props: React.ComponentProps<typeof SelectContentPrimitive>,
) {
	return <SelectContentPrimitive sideOffset={4} {...props} />;
}

function SelectItem({
	children,
	...props
}: Omit<React.ComponentProps<typeof SelectItemPrimitive>, "children"> & {
	children?: React.ReactNode;
}) {
	return (
		<SelectItemPrimitive {...props}>
			{children}
			<SelectItemIndicator />
		</SelectItemPrimitive>
	);
}

export {
	Select,
	SelectContent,
	SelectGroup,
	SelectGroupLabel,
	SelectItem,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
};
