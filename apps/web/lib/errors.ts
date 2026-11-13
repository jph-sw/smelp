import { ORPCError } from "@orpc/client";
import { toast } from "#/components/ui/toast";

// Network failures and bugs aren't ORPCErrors, but the user still needs to know
// that their action didn't go through.
export function toastError(
	error: unknown,
	fallback = "Something went wrong. Please try again.",
) {
	if (error instanceof ORPCError) {
		toast({ type: "error", description: error.message });
		return;
	}

	console.error(error);
	toast({ type: "error", description: fallback });
}
