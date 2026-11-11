import { ORPCError } from "@orpc/client";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { Button } from "#/components/ui/button";
import { usePageTitle } from "#/hooks/use-page-title";

export function ErrorPage({ error, reset }: ErrorComponentProps) {
	const title =
		error instanceof ORPCError ? orpcErrorTitle(error) : "Something went wrong";
	usePageTitle(title);
	const description =
		error instanceof ORPCError
			? orpcErrorDescription(error)
			: "An unexpected error occurred. Please try again.";

	return (
		<div className="flex min-h-screen flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
			<h1 className="text-sm font-medium">{title}</h1>
			<p className="max-w-sm text-xs text-muted-foreground">{description}</p>
			<div className="flex gap-2">
				<Button variant="outline" onClick={reset}>
					Try again
				</Button>
				<Button onClick={() => window.location.assign("/")}>Go home</Button>
			</div>
		</div>
	);
}

function orpcErrorTitle(error: ORPCError<string, unknown>) {
	switch (error.code) {
		case "NOT_FOUND":
			return "Not found";
		case "UNAUTHORIZED":
		case "FORBIDDEN":
			return "Access denied";
		default:
			return "Something went wrong";
	}
}

function orpcErrorDescription(error: ORPCError<string, unknown>) {
	switch (error.code) {
		case "NOT_FOUND":
			return "The resource you're looking for doesn't exist or was removed.";
		case "UNAUTHORIZED":
		case "FORBIDDEN":
			return "You don't have permission to view this.";
		default:
			return "An unexpected error occurred. Please try again.";
	}
}
