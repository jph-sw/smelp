import { ORPCError } from "@orpc/server";
import { deleteCookie, getCookie, setCookie } from "@orpc/server/helpers";
import { Auth } from "@smelp/auth";
import { DB } from "@smelp/db";
import * as v from "valibot";
import { requireSession } from "../../lib/access";
import { useSecureCookies } from "../../lib/cookies";
import {
	beginOidcLogin,
	finishOidcLogin,
	type LinkTarget,
	oidcConfig,
	oidcCookieName,
	oidcProviderId,
	safeLocalPath,
} from "../../lib/oidc";
import {
	linkOidcIdentity,
	resolveOidcAccount,
	startOidcSession,
} from "../../lib/oidc-account";
import { enforceRateLimit, RateLimiter } from "../../lib/rate-limit";
import { base } from "../../orpc";

const sql = new DB().sqlite;
const auth = new Auth();

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const startsByIp = new RateLimiter(120, FIFTEEN_MINUTES);
const callbacksByIp = new RateLimiter(120, FIFTEEN_MINUTES);

const passwordSetsByUser = new RateLimiter(10, FIFTEEN_MINUTES);
const linkStartsByUser = new RateLimiter(20, FIFTEEN_MINUTES);

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

// A person adding a provider to their account lands back in account settings.
function linkOutcome(code: string, headers: Headers) {
	return redirect(`/account?${new URLSearchParams({ oidc: code })}`, headers);
}

const clearLoginCookie = (headers: Headers, state: string | null) => {
	if (state)
		deleteCookie(headers, oidcCookieName(state), { path: COOKIE_PATH });
};

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
		const {
			url: authorizeUrl,
			binding,
			state,
		} = await beginOidcLogin(config, {
			invite: safeInvite,
			next: safeLocalPath(url.searchParams.get("next")),
		});
		const headers = new Headers();
		// Ties the login to this browser, so a link made by someone else is refused.
		setCookie(headers, oidcCookieName(state), binding, {
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

	const params = new URL(request.url).searchParams;
	const state = params.get("state");
	const headers = new Headers();
	clearLoginCookie(headers, state);
	if (!callbacksByIp.consume(ip).allowed) {
		return failure("rate_limited", null, headers);
	}

	const outcome = await finishOidcLogin(
		config,
		params,
		state ? getCookie(request.headers, oidcCookieName(state)) : undefined,
	);
	if (outcome.link) {
		if (!outcome.ok) return linkOutcome(outcome.error, headers);
		return await finishLink(
			request,
			headers,
			outcome.link,
			outcome.claims.sub,
			config,
		);
	}
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

// The link flow ends here. The identity goes to the account of the session that
// started it, and only if that exact session is still the one making this request.
async function finishLink(
	request: Request,
	headers: Headers,
	target: LinkTarget,
	sub: string,
	config: NonNullable<ReturnType<typeof oidcConfig>>,
) {
	const token = getCookie(request.headers, "auth_session");
	const current = token ? await auth.validateAuthSessionToken(token) : null;
	if (!current || current.id !== target.sessionId) {
		return failure("session_ended", null, headers);
	}

	const result = await linkOidcIdentity({
		providerId: oidcProviderId(config),
		sub,
		target,
	});
	return linkOutcome(result.ok ? "linked" : result.error, headers);
}

// Public: the sign-in and sign-up pages need this before anyone is signed in. It
// only says whether the button shows, and what it says.
export const findSignInOptions = base.handler(async () => {
	const config = oidcConfig();
	return { oidc: config ? { label: config.label } : null };
});

// "Sign in with Authentik" names the provider "Authentik".
const providerName = (label: string) =>
	label.replace(/^Sign in with\s+/i, "") || "SSO";

// Starts adding the provider to the signed-in person's account. It's an RPC call and
// not a link to follow, so it can't be triggered from another site: the session
// cookie isn't sent on cross-site POSTs. Who it applies to, and which session, are
// taken from the session here and kept on the server with the state.
export const startOidcLink = base.handler(async ({ context }) => {
	const config = oidcConfig();
	if (!config) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Single sign-on isn't set up on this server.",
		});
	}
	const session = await requireSession(context.headers);
	enforceRateLimit(linkStartsByUser, session.userId);

	const existing = await sql`
		SELECT 1 FROM auth_account
		WHERE userId = ${session.userId} AND providerId = ${oidcProviderId(config)}
	`;
	if (existing.length > 0) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Your account is already linked to this provider.",
		});
	}

	let login: Awaited<ReturnType<typeof beginOidcLogin>>;
	try {
		login = await beginOidcLogin(config, {
			invite: null,
			next: null,
			link: { userId: session.userId, sessionId: session.id },
		});
	} catch {
		throw new ORPCError("SERVICE_UNAVAILABLE", {
			message: "The sign-in provider can't be reached right now.",
		});
	}
	setCookie(context.resHeaders, oidcCookieName(login.state), login.binding, {
		httpOnly: true,
		secure: useSecureCookies(),
		sameSite: "lax",
		path: COOKIE_PATH,
		maxAge: 10 * 60,
	});
	return { url: login.url };
});

// Which sign-in methods the signed-in person has.
export const findLinkedAccounts = base.handler(async ({ context }) => {
	const session = await requireSession(context.headers);
	const config = oidcConfig();

	const rows = (await sql`
		SELECT providerId, password FROM auth_account WHERE userId = ${session.userId}
	`) as { providerId: string; password: string | null }[];

	const current = config ? oidcProviderId(config) : null;
	return {
		// Set when this provider is on and the person hasn't linked it yet.
		linkable:
			config && !rows.some((row) => row.providerId === current)
				? { name: providerName(config.label) }
				: null,
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
						? providerName(config?.label ?? "")
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

// For people whose account was made through a provider and who have no password
// yet. Changing an
// existing password still needs the current one, in changePassword.
export const setPassword = base
	.input(
		v.object({
			newPassword: v.pipe(v.string(), v.minLength(10), v.maxLength(64)),
		}),
	)
	.handler(async ({ input, context }) => {
		const session = await requireSession(context.headers);
		enforceRateLimit(passwordSetsByUser, session.userId);

		const hash = await auth.hashPassword(input.newPassword);
		const now = Date.now();

		const done = await sql.begin(async (tx) => {
			// Checked here, after the slow hashing, so a session that ended in the
			// meantime can't still write a credential.
			const stillSignedIn = await tx`
				SELECT 1 FROM auth_session WHERE id = ${session.id}
			`;
			if (stillSignedIn.length === 0) throw new ORPCError("UNAUTHORIZED");

			const updated = await tx`
				UPDATE auth_account SET password = ${hash}, updatedAt = ${now}
				WHERE userId = ${session.userId} AND providerId = 'password' AND password IS NULL
				RETURNING id
			`;
			if (updated.length > 0) return true;

			const existing = await tx`
				SELECT 1 FROM auth_account
				WHERE userId = ${session.userId} AND providerId = 'password'
			`;
			if (existing.length > 0) return false;

			await tx`INSERT INTO auth_account ${tx({
				id: auth.generateRandomId(),
				userId: session.userId,
				accountId: auth.generateRandomId(),
				providerId: "password",
				password: hash,
				createdAt: now,
				updatedAt: now,
				accessToken: null,
				refreshToken: null,
				accessTokenExpiresAt: null,
				refreshTokenExpiresAt: null,
				scope: null,
				idToken: null,
			})}`;
			return true;
		});

		if (!done) {
			throw new ORPCError("BAD_REQUEST", {
				message: "You already have a password. Use Change password instead.",
			});
		}
		return { success: true };
	});
