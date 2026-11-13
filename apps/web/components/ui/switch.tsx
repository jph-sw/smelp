import { Switch as SwitchPrimitive, SwitchThumb } from "@ui-sdk/react/switch";
import type * as React from "react";

function Switch(props: React.ComponentProps<typeof SwitchPrimitive>) {
	return (
		<SwitchPrimitive {...props}>
			<SwitchThumb />
		</SwitchPrimitive>
	);
}

export { Switch };
