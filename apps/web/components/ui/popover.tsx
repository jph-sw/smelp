import {
	PopoverClose,
	PopoverContent as PopoverContentPrimitive,
	PopoverDescription,
	Popover as PopoverPrimitive,
	PopoverTitle,
	PopoverTrigger,
} from "@ui-sdk/react/popover";
import type * as React from "react";

import { cn } from "#/lib/utils";

function Popover(props: React.ComponentProps<typeof PopoverPrimitive>) {
	return <PopoverPrimitive {...props} />;
}

function PopoverContent({
	className,
	sideOffset = 4,
	...props
}: React.ComponentProps<typeof PopoverContentPrimitive>) {
	return (
		<PopoverContentPrimitive
			sideOffset={sideOffset}
			className={cn("flex w-72 flex-col gap-2", className)}
			{...props}
		/>
	);
}

export {
	Popover,
	PopoverClose,
	PopoverContent,
	PopoverDescription,
	PopoverTitle,
	PopoverTrigger,
};
