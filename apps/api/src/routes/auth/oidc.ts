import { ORPCError } from "@orpc/server";
import { deleteCookie, getCookie, setCookie } from "@orpc/server/helpers";
import { Auth } from "@smelp/auth";
import { DB } from "@smelp/db";
import { requireSession } from "../../lib/access";
import { useSecureCookies } from "../../lib/cookies";
import {
	beginOidcLogin,
	finishOidcLogin,
	OIDC_COOKIE,
	oidcConfig,
	oidcProviderId,
	safeLocalPath,
} from "../../lib/oidc";
import { resolveOidcAccount, startOidcSession } from "../../lib/oidc-account";
import { RateLimiter } from "../../lib/rate-limit";
import { base } from "../../orpc";

const sql = new DB().sqlite;
const auth = new Auth();

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const startsByIp = new RateLimiter(30, FIFTEEN_MINUTES);
const callbacksByIp = new RateLimiter(30, FIFTEEN_MINUTES);

const COOKIE_PATH = "/api/auth/oidc";
const MAX_INVITE_LENGTH = 200;

function redirect(path: string, headers = new Headers()) {
	headers.set("Location", path);
	headers.set("Cache-Control", "no-store");
	return new Response(null, { status: 302, headers });
}

// Only fixed codes travel in the address, which the sign-in page turns into text.
function failure(error: string, invite: string | null, headers?: Headers) {
	const search = new URLSearchParams({ oidcError: error });
	if (invite) search.set("invite", invite);
	return redirect(`/signin?${search}`, headers);
}

const clearLoginCookie = (headers: Headers) =>
	deleteCookie(headers, OIDC_COOKIE, { path: COOKIE_PATH });

// The browser comes here from the sign-in button and is sent on to the provider.
export async function oidcStart(request: Request, ip: string) {
	const config = oidcConfig();
	if (!config || request.method !== "GET") {
		return new Response("Not found", { status: 404 });
	}

	const url = new URL(request.url);
	const invite = url.searchParams.get("invite");
	const safeInvite =
		invite && invite.length <= MAX_INVITE_LENGTH ? invite : null;
	if (!startsByIp.consume(ip).allowed) {
		return failure("rate_limited", safeInvite);
	}

	try {
		const { url: authorizeUrl, binding } = await beginOidcLogin(config, {
			invite: safeInvite,
			next: safeLocalPath(url.searchParams.get("next")),
		});
		const headers = new Headers();
		// Ties the login to this browser, so a link made by someone else is refused.
		setCookie(headers, OIDC_COOKIE, binding, {
			httpOnly: true,
			secure: useSecureCookies(),
			sameSite: "lax",
			path: COOKIE_PATH,
			maxAge: 10 * 60,
		});
		return redirect(authorizeUrl, headers);
	} catch {
		return failure("unavailable", safeInvite);
	}
}

// The provider sends the browser back here with a code.
export async function oidcCallback(request: Request, ip: string) {
	const config = oidcConfig();
	if (!config || request.method !== "GET") {
		return new Response("Not found", { status: 404 });
	}

	const headers = new Headers();
	clearLoginCookie(headers);
	if (!callbacksByIp.consume(ip).allowed) {
		return failure("rate_limited", null, headers);
	}

	const params = new URL(request.url).searchParams;
	const outcome = await finishOidcLogin(
		config,
		params,
		getCookie(request.headers, OIDC_COOKIE),
	);
	if (!outcome.ok) return failure(outcome.error, outcome.invite, headers);

	const account = await resolveOidcAccount({
		providerId: oidcProviderId(config),
		claims: outcome.claims,
		invite: outcome.invite,
	});
	if (!account.ok) return failure(account.error, outcome.invite, headers);

	const session = await startOidcSession(account.userId, account.created);
	setCookie(headers, "auth_session", session.authSessionToken, {
		httpOnly: true,
		secure: useSecureCookies(),
		sameSite: "lax",
		path: "/",
		maxAge: auth.authSessionExpiresInSeconds,
	});

	if (outcome.invite) {
		return redirect(`/invite/${encodeURIComponent(outcome.invite)}`, headers);
	}
	if (account.created) return redirect("/create-workspace", headers);
	return redirect(safeLocalPath(outcome.next) ?? "/", headers);
}

// Public: the sign-in and sign-up pages need this before anyone is signed in. It
// only says whether the button shows, and what it says.
export const findSignInOptions = base.handler(async () => ({
	oidc: oidcConfig() ? { label: oidcConfig()?.label ?? "" } : null,
}));

// Which sign-in methods the signed-in person has.
export const findLinkedAccounts = base.handler(async ({ context }) => {
	const session = await requireSession(context.headers);
	const config = oidcConfig();

	const rows = (await sql`
		SELECT providerId, password FROM auth_account WHERE userId = ${session.userId}
	`) as { providerId: string; password: string | null }[];

	const current = config ? oidcProviderId(config) : null;
	return {
		hasPassword: rows.some(
			(row) => row.providerId === "password" && row.password !== null,
		),
		providers: rows
			.filter((row) => row.providerId.startsWith("oidc:"))
			.map((row) => ({
				// Links to a provider that was since replaced are still listed, so
				// they can be removed.
				label:
					row.providerId === current
						? (config?.label.replace(/^Sign in with\s+/i, "") ?? "SSO")
						: "A previous single sign-on provider",
			})),
	};
});

// Removing the only way to sign in would lock the person out, so it needs a
// password. That's decided inside the delete, not before it.
export const unlinkOidc = base.handler(async ({ context }) => {
	const session = await requireSession(context.headers);

	const removed = await sql`
		DELETE FROM auth_account
		WHERE userId = ${session.userId}
			AND providerId LIKE 'oidc:%'
			AND EXISTS (
				SELECT 1 FROM auth_account AS password_account
				WHERE password_account.userId = ${session.userId}
					AND password_account.providerId = 'password'
					AND password_account.password IS NOT NULL
			)
		RETURNING id
	`;
	if (removed.length > 0) return { success: true };

	const linked = await sql`
		SELECT 1 FROM auth_account
		WHERE userId = ${session.userId} AND providerId LIKE 'oidc:%'
	`;
	if (linked.length === 0) {
		throw new ORPCError("NOT_FOUND", {
			message: "No linked account to remove.",
		});
	}
	throw new ORPCError("BAD_REQUEST", {
		message:
			"This is the only way you can sign in, because your account has no password.",
	});
});
