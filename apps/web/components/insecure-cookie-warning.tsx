import { useSuspenseQuery } from "@tanstack/react-query";
import { instanceStatusQueryOptions } from "#/lib/data/instance";

// Browsers drop a Secure cookie over plain HTTP, so signing in would appear to do
// nothing. isSecureContext is also true on localhost, where such cookies do work.
export function InsecureCookieWarning() {
	const { data: status } = useSuspenseQuery(instanceStatusQueryOptions);
	if (!status.secureCookies || window.isSecureContext) return null;

	return (
		<p role="alert" className="rounded-lg bg-secondary p-3 text-sm">
			Signing in won't work over plain HTTP. Use HTTPS, or to try smelp on a
			local network, set <code>SECURE_COOKIES=false</code> on the server.
		</p>
	);
}
