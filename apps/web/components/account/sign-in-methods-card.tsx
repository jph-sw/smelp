import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { toast } from "#/components/ui/toast";
import {
	linkedAccountsQueryOptions,
	startOidcLink,
	unlinkOidc,
} from "#/lib/data/sign-in-options";
import { toastError } from "#/lib/errors";
import { SettingsSection } from "./settings-section";

export function SignInMethodsCard({
	accounts,
}: {
	accounts: {
		hasPassword: boolean;
		providers: { label: string }[];
		linkable: { name: string } | null;
	};
}) {
	const queryClient = useQueryClient();
	const [isUnlinking, setIsUnlinking] = useState(false);
	const [isLinking, setIsLinking] = useState(false);

	const link = async () => {
		setIsLinking(true);
		try {
			const { url } = await startOidcLink();
			// Leaves for the provider, which sends the browser back here.
			window.location.assign(url);
		} catch (e) {
			toastError(e);
			setIsLinking(false);
		}
	};

	const unlink = async () => {
		setIsUnlinking(true);
		try {
			await unlinkOidc();
			await queryClient.invalidateQueries({
				queryKey: linkedAccountsQueryOptions.queryKey,
			});
			toast({ type: "success", description: "Provider unlinked." });
		} catch (e) {
			toastError(e);
		} finally {
			setIsUnlinking(false);
		}
	};

	return (
		<SettingsSection title="Single sign-on" className="space-y-2">
			{accounts.providers.map((provider) => (
				<div
					key={provider.label}
					className="flex items-center justify-between gap-4"
				>
					<span className="text-sm [overflow-wrap:anywhere]">
						Linked to {provider.label}
					</span>
					{accounts.hasPassword && (
						<Button
							type="button"
							variant="outline"
							disabled={isUnlinking}
							onClick={unlink}
						>
							Unlink
						</Button>
					)}
				</div>
			))}
			{accounts.linkable && (
				<Button
					type="button"
					variant="outline"
					disabled={isLinking}
					onClick={link}
				>
					Link {accounts.linkable.name}
				</Button>
			)}
			{!accounts.hasPassword && accounts.providers.length > 0 && (
				<p className="text-xs text-muted-foreground">
					This is the only way you can sign in, because your account has no
					password, so it can't be unlinked.
				</p>
			)}
		</SettingsSection>
	);
}
