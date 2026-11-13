import { Separator as SeparatorPrimitive } from "@ui-sdk/react/separator";
import type * as React from "react";

function Separator(props: React.ComponentProps<typeof SeparatorPrimitive>) {
	return <SeparatorPrimitive {...props} />;
}

export { Separator };
