import {
	TooltipContent as TooltipContentPrimitive,
	Tooltip as TooltipPrimitive,
	TooltipTrigger,
} from "@ui-sdk/react/tooltip";
import type * as React from "react";

function Tooltip(props: React.ComponentProps<typeof TooltipPrimitive>) {
	return <TooltipPrimitive {...props} />;
}

function TooltipContent({
	sideOffset = 4,
	...props
}: React.ComponentProps<typeof TooltipContentPrimitive>) {
	return <TooltipContentPrimitive sideOffset={sideOffset} {...props} />;
}

export { Tooltip, TooltipContent, TooltipTrigger };
