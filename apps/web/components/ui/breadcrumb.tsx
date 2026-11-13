import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as React from "react";

import { cn } from "#/lib/utils";

function Breadcrumb(props: React.ComponentProps<"nav">) {
	return <nav aria-label="breadcrumb" {...props} />;
}

function BreadcrumbList({ className, ...props }: React.ComponentProps<"ol">) {
	return (
		<ol
			className={cn(
				"flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground",
				className,
			)}
			{...props}
		/>
	);
}

function BreadcrumbItem({ className, ...props }: React.ComponentProps<"li">) {
	return (
		<li
			className={cn("inline-flex items-center gap-1", className)}
			{...props}
		/>
	);
}

// `render` swaps the <a> for another element, like a router Link.
function BreadcrumbLink({
	className,
	render,
	...props
}: React.ComponentProps<"a"> & {
	render?: React.ReactElement<{ className?: string }>;
}) {
	const classes = cn("hover:text-foreground", className);
	if (render) {
		return React.cloneElement(render, {
			...props,
			className: cn(classes, render.props.className),
		});
	}
	return <a className={classes} {...props} />;
}

function BreadcrumbPage({ className, ...props }: React.ComponentProps<"span">) {
	return (
		<span
			aria-current="page"
			className={cn("text-foreground", className)}
			{...props}
		/>
	);
}

function BreadcrumbSeparator({
	children,
	className,
	...props
}: React.ComponentProps<"li">) {
	return (
		<li
			role="presentation"
			aria-hidden="true"
			className={cn("[&>svg]:size-3.5", className)}
			{...props}
		>
			{children ?? <HugeiconsIcon icon={ArrowRight01Icon} />}
		</li>
	);
}

export {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
};
