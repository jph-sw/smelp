import { Button as ButtonPrimitive } from "@ui-sdk/react/button";
import type * as React from "react";

type Variant =
	| "default"
	| "outline"
	| "secondary"
	| "ghost"
	| "destructive"
	| "link";
type Size =
	| "default"
	| "xs"
	| "sm"
	| "lg"
	| "icon"
	| "icon-xs"
	| "icon-sm"
	| "icon-lg";

// ui-sdk's web.css styles "solid" and "destructive"; the rest are in styles.css.
const VARIANT: Record<Variant, string | undefined> = {
	default: "solid",
	outline: undefined,
	secondary: undefined,
	ghost: "ghost",
	destructive: "destructive",
	link: "link",
};

type ButtonVariantProps = { variant?: Variant | null; size?: Size | null };

function buttonData({ variant, size }: ButtonVariantProps) {
	return {
		"data-variant": VARIANT[variant ?? "default"],
		"data-size": size && size !== "default" ? size : undefined,
	};
}

function Button({
	variant = "default",
	size = "default",
	...props
}: React.ComponentProps<typeof ButtonPrimitive> & ButtonVariantProps) {
	return <ButtonPrimitive {...buttonData({ variant, size })} {...props} />;
}

export { Button, type ButtonVariantProps, buttonData };
