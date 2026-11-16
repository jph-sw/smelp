import {
	SelectContent as SelectContentPrimitive,
	SelectGroup,
	SelectGroupLabel,
	SelectItemIcon,
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

// ui-sdk copies the chosen item's icon only once the list has rendered, so the
// trigger takes the icon from the caller and shows it from the first paint.
function SelectValueWithIcon({ icon }: { icon?: React.ReactNode }) {
	if (!icon) return <SelectValue />;
	return (
		<span className="flex min-w-0 items-center gap-2">
			{icon}
			<SelectValue />
		</span>
	);
}

export {
	Select,
	SelectContent,
	SelectGroup,
	SelectGroupLabel,
	SelectItem,
	SelectItemIcon,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
	SelectValueWithIcon,
};
