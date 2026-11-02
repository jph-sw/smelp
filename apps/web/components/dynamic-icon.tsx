// this was written with the help of ai
import { HugeiconsIcon } from "@hugeicons/react";
import type * as React from "react";
import { useIconCollection } from "#/lib/icon-collection";

type DynamicIconProps = {
	name?: string | null;
} & Omit<React.ComponentProps<typeof HugeiconsIcon>, "icon">;

export function DynamicIcon({ name, ...props }: DynamicIconProps) {
	const icons = useIconCollection();
	if (!name) return null; // nothing selected yet
	if (!icons) {
		// Holds the space, so the layout doesn't shift when the icon arrives.
		const size = props.size ?? 24;
		return (
			<span
				aria-hidden
				className={props.className}
				style={{ display: "inline-block", width: size, height: size }}
			/>
		);
	}
	const icon = icons[name];
	if (!icon) return null; // stale/unknown name
	return <HugeiconsIcon icon={icon} {...props} />;
}
