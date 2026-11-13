import { Textarea as TextareaPrimitive } from "@ui-sdk/react/textarea";
import type * as React from "react";

import { cn } from "#/lib/utils";

function Textarea({
	className,
	...props
}: React.ComponentProps<typeof TextareaPrimitive>) {
	return (
		<TextareaPrimitive
			className={cn("field-sizing-content w-full resize-none", className)}
			{...props}
		/>
	);
}

export { Textarea };
