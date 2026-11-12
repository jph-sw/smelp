import { useSuspenseQuery } from "@tanstack/react-query";
import { Button } from "#/components/ui/button";
import {
	oidcStartUrl,
	signInOptionsQueryOptions,
} from "#/lib/data/sign-in-options";

// Shows only when the server has single sign-on set up. A plain link, since the
// whole page leaves for the provider and comes back signed in.
export function OidcButton({ invite }: { invite?: string }) {
	const { data } = useSuspenseQuery(signInOptionsQueryOptions);
	if (!data.oidc) return null;

	return (
		<Button
			variant="outline"
			className="w-full"
			render={<a href={oidcStartUrl(invite)} />}
		>
			{data.oidc.label}
		</Button>
	);
}
