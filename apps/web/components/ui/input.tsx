import { Input as InputPrimitive } from "@ui-sdk/react/input";
import type * as React from "react";

import { cn } from "#/lib/utils";

function Input({
	className,
	...props
}: React.ComponentProps<typeof InputPrimitive>) {
	return (
		<InputPrimitive className={cn("w-full min-w-0", className)} {...props} />
	);
}

export { Input };
