import {
	CollapsiblePanel,
	Collapsible as CollapsiblePrimitive,
	CollapsibleTrigger,
} from "@ui-sdk/react/collapsible";
import type * as React from "react";

function Collapsible(props: React.ComponentProps<typeof CollapsiblePrimitive>) {
	return <CollapsiblePrimitive {...props} />;
}

function CollapsibleContent(
	props: React.ComponentProps<typeof CollapsiblePanel>,
) {
	return <CollapsiblePanel {...props} />;
}

export { Collapsible, CollapsibleContent, CollapsibleTrigger };
