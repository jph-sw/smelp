// Browsers refuse a Secure cookie over plain HTTP, which makes signing in silently
// fail. SECURE_COOKIES=false allows trying smelp on a local network before HTTPS.
export const useSecureCookies = () =>
	process.env.SECURE_COOKIES
		? process.env.SECURE_COOKIES !== "false"
		: process.env.NODE_ENV === "production";
