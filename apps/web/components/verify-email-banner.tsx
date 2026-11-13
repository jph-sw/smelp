import { useMutation } from "@tanstack/react-query";
import { Button } from "#/components/ui/button";
import { toast } from "#/components/ui/toast";
import type { AuthUser } from "#/lib/auth";
import { toastError } from "#/lib/errors";
import { orpc } from "#/lib/orpc";

// Shown to accounts that haven't confirmed their address yet.
export function VerifyEmailBanner({ user }: { user: AuthUser }) {
	const { mutate: resend, isPending } = useMutation({
		mutationFn: () => orpc.auth.resendEmailVerification(),
		onSuccess: () =>
			toast.add({
				type: "success",
				description: `We sent a new link to ${user.email}.`,
			}),
		onError: (e) => toastError(e),
	});

	if (!user.emailVerificationPending) return null;

	return (
		<div
			role="status"
			className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-secondary px-4 py-2 text-sm"
		>
			<p className="min-w-0 flex-1 basis-64 [overflow-wrap:anywhere]">
				Check your email. We sent a link to confirm {user.email}. Until you
				confirm it, you can't create workspaces.
			</p>
			<Button
				variant="outline"
				size="sm"
				disabled={isPending}
				onClick={() => resend()}
			>
				Send again
			</Button>
		</div>
	);
}
