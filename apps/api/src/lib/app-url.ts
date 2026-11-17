/** This install's public address, with no trailing slash. */
export function appUrl(requestOrigin: string) {
	return (process.env.APP_URL ?? requestOrigin).replace(/\/+$/, "");
}

/** appUrl for code that only has the request's headers, like an oRPC procedure. */
export function appUrlFromHeaders(headers: Headers) {
	// Bun serves plain HTTP here, so this is the origin request.url has on /mcp.
	return appUrl(`http://${headers.get("host") ?? "localhost"}`);
}
