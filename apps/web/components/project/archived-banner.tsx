import { Archive02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "#/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";

export function ArchivedBanner({ className }: { className?: string }) {
	return (
		<Alert className={cn("w-auto", className)}>
			<HugeiconsIcon icon={Archive02Icon} />
			<AlertTitle>This project is archived</AlertTitle>
			<AlertDescription>
				It is read-only. A project admin can unarchive it in project settings.
			</AlertDescription>
		</Alert>
	);
}
