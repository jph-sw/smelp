import {
	AvatarFallback as AvatarFallbackPrimitive,
	AvatarImage as AvatarImagePrimitive,
	Avatar as AvatarPrimitive,
} from "@ui-sdk/react/avatar";
import type * as React from "react";

import { cn } from "#/lib/utils";

const SIZE = { sm: "size-6 text-xs", default: "size-8 text-sm", lg: "size-10" };

function Avatar({
	className,
	size = "default",
	...props
}: React.ComponentProps<typeof AvatarPrimitive> & {
	size?: keyof typeof SIZE;
}) {
	return (
		<AvatarPrimitive
			data-size={size}
			className={cn(
				"relative inline-flex shrink-0 overflow-hidden rounded-full",
				SIZE[size],
				className,
			)}
			{...props}
		/>
	);
}

function AvatarImage({
	className,
	...props
}: React.ComponentProps<typeof AvatarImagePrimitive>) {
	return (
		<AvatarImagePrimitive
			className={cn("size-full object-cover", className)}
			{...props}
		/>
	);
}

function AvatarFallback({
	className,
	...props
}: React.ComponentProps<typeof AvatarFallbackPrimitive>) {
	return (
		<AvatarFallbackPrimitive
			className={cn(
				"flex size-full items-center justify-center bg-muted text-muted-foreground",
				className,
			)}
			{...props}
		/>
	);
}

export { Avatar, AvatarFallback, AvatarImage };
