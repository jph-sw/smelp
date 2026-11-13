import { Label as LabelPrimitive } from "@ui-sdk/react/label";
import type * as React from "react";

function Label(props: React.ComponentProps<typeof LabelPrimitive>) {
	return <LabelPrimitive {...props} />;
}

export { Label };
