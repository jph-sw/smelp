// this was written with the help of ai
import * as HugeIconsCollection from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type * as React from "react";

const allIcons: Record<string, IconSvgElement> =
	HugeIconsCollection as unknown as Record<string, IconSvgElement>;

type DynamicIconProps = {
	name?: string | null;
} & Omit<React.ComponentProps<typeof HugeiconsIcon>, "icon">;

export function DynamicIcon({ name, ...props }: DynamicIconProps) {
	if (!name) return null; // nothing selected yet
	const icon = allIcons[name];
	if (!icon) return null; // stale/unknown name
	return <HugeiconsIcon icon={icon} {...props} />;
}
