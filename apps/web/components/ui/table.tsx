import type * as React from "react";

import { cn } from "#/lib/utils";

function Table({ className, ...props }: React.ComponentProps<"table">) {
	return (
		<div className="w-full overflow-x-auto">
			<table
				className={cn("w-full caption-bottom text-sm", className)}
				{...props}
			/>
		</div>
	);
}

function TableHeader(props: React.ComponentProps<"thead">) {
	return <thead {...props} />;
}

function TableBody(props: React.ComponentProps<"tbody">) {
	return <tbody {...props} />;
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
	return <tr className={cn("border-b", className)} {...props} />;
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
	return (
		<th
			className={cn(
				"h-9 px-2 text-left font-medium whitespace-nowrap text-muted-foreground",
				className,
			)}
			{...props}
		/>
	);
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
	return <td className={cn("p-2 align-middle", className)} {...props} />;
}

export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow };
