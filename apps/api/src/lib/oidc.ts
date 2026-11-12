import { Utils } from "@smelp/db";
import { createRemoteJWKSet, type JWTPayload, jwtVerify } from "jose";
import * as oauth from "oauth4webapi";

// Sign-in with OpenID Connect is optional. It turns on when all of these are set:
//
//   OIDC_ISSUER_URL     the provider's issuer, for example https://auth.example.com/realms/main
//   OIDC_CLIENT_ID      client id registered with the provider
//   OIDC_CLIENT_SECRET  client secret registered with the provider
//   APP_URL             public address of this install; the provider is told to send
//                       people back to APP_URL/api/auth/oidc/callback
//   OIDC_BUTTON_LABEL   text of the sign-in button, defaults to "Sign in with SSO"

const utils = new Utils();

export const OIDC_CALLBACK_PATH = "/api/auth/oidc/callback";
// One cookie per login in progress, so starting a second login in another tab
// doesn't break the first.
export const oidcCookieName = (state: string) =>
	`oidc_login_${state.slice(0, 16).replace(/[^A-Za-z0-9_-]/g, "")}`;
const LOGIN_LIFETIME_MS = 10 * 60 * 1000;
const DISCOVERY_LIFETIME_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_PENDING_LOGINS = 10_000;
const CLOCK_SKEW_SECONDS = 30;
// Only asymmetric algorithms, so an ID token can never be "signed" with a shared secret.
const SIGNING_ALGORITHMS = [
	"RS256",
	"RS384",
	"RS512",
	"PS256",
	"PS384",
	"PS512",
	"ES256",
	"ES384",
	"ES512",
	"EdDSA",
];

export type OidcConfig = {
	issuer: URL;
	clientId: string;
	clientSecret: string;
	label: string;
	appUrl: string;
	redirectUri: string;
	allowInsecure: boolean;
};

const isLoopback = (url: URL) =>
	["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);

function readConfig(): {
	config: OidcConfig | null;
	missing: string[];
	problem?: string;
} {
	const env = process.env;
	const required = {
		OIDC_ISSUER_URL: env.OIDC_ISSUER_URL,
		OIDC_CLIENT_ID: env.OIDC_CLIENT_ID,
		OIDC_CLIENT_SECRET: env.OIDC_CLIENT_SECRET,
		APP_URL: env.APP_URL,
	};
	const missing = Object.entries(required)
		.filter(([, value]) => !value)
		.map(([name]) => name);
	if (
		!required.OIDC_ISSUER_URL ||
		!required.OIDC_CLIENT_ID ||
		!required.OIDC_CLIENT_SECRET ||
		!required.APP_URL
	) {
		return { config: null, missing };
	}

	let issuer: URL;
	let appUrl: URL;
	try {
		issuer = new URL(required.OIDC_ISSUER_URL);
		appUrl = new URL(required.APP_URL);
	} catch {
		return {
			config: null,
			missing,
			problem: "OIDC_ISSUER_URL or APP_URL isn't a valid address",
		};
	}
	const allowInsecure = issuer.protocol === "http:" && isLoopback(issuer);
	if (issuer.protocol !== "https:" && !allowInsecure) {
		return {
			config: null,
			missing,
			problem: "OIDC_ISSUER_URL must start with https://",
		};
	}

	const base = appUrl.origin;
	return {
		missing,
		config: {
			issuer,
			clientId: required.OIDC_CLIENT_ID,
			clientSecret: required.OIDC_CLIENT_SECRET,
			label: env.OIDC_BUTTON_LABEL?.trim() || "Sign in with SSO",
			appUrl: base,
			redirectUri: `${base}${OIDC_CALLBACK_PATH}`,
			allowInsecure,
		},
	};
}

export const oidcConfig = () => readConfig().config;
export const isOidcEnabled = () => readConfig().config !== null;

export function logOidcStatus() {
	const { config, missing, problem } = readConfig();
	if (config) {
		utils.logger.info(
			`Sign-in with OpenID Connect is on (${config.issuer.origin})`,
		);
	} else if (problem) {
		utils.logger.warn(`Sign-in with OpenID Connect is off: ${problem}`);
	} else if (missing.length > 0 && missing.length < 4) {
		utils.logger.warn(
			`Sign-in with OpenID Connect is off. Set ${missing.join(", ")} to turn it on.`,
		);
	}
}

// Different providers give the same person different ids, so each issuer gets its
// own account rows. Pointing smelp at another provider can't match the old ids.
export const oidcProviderId = (config: OidcConfig) =>
	`oidc:${config.issuer.href.replace(/\/+$/, "")}`;

// Only a path on this site is a safe place to send someone back to.
export function safeLocalPath(value: string | null | undefined): string | null {
	if (!value || value.length > 500) return null;
	if (!value.startsWith("/") || value.startsWith("//")) return null;
	for (const char of value) {
		const code = char.charCodeAt(0);
		if (char === "\\" || code < 0x20 || code === 0x7f) return null;
	}
	try {
		const parsed = new URL(value, "http://local.invalid");
		return parsed.origin === "http://local.invalid"
			? parsed.pathname + parsed.search + parsed.hash
			: null;
	} catch {
		return null;
	}
}

// --- Provider metadata ---------------------------------------------------------

type Provider = {
	as: oauth.AuthorizationServer;
	keys: ReturnType<typeof createRemoteJWKSet>;
};

let cachedProvider: {
	key: string;
	at: number;
	provider: Promise<Provider>;
} | null = null;

function requestOptions(config: OidcConfig) {
	return {
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		...(config.allowInsecure ? { [oauth.allowInsecureRequests]: true } : {}),
	};
}

async function discover(config: OidcConfig): Promise<Provider> {
	const response = await oauth.discoveryRequest(config.issuer, {
		algorithm: "oidc",
		...requestOptions(config),
	});
	const as = await oauth.processDiscoveryResponse(config.issuer, response);
	if (!as.authorization_endpoint || !as.token_endpoint || !as.jwks_uri) {
		throw new Error("The provider's discovery document is incomplete");
	}
	return { as, keys: createRemoteJWKSet(new URL(as.jwks_uri)) };
}

function providerFor(config: OidcConfig): Promise<Provider> {
	const key = config.issuer.href;
	const now = Date.now();
	if (
		cachedProvider &&
		cachedProvider.key === key &&
		now - cachedProvider.at < DISCOVERY_LIFETIME_MS
	) {
		return cachedProvider.provider;
	}
	const provider = discover(config);
	const entry = { key, at: now, provider };
	cachedProvider = entry;
	// A failed lookup must not be remembered.
	provider.catch(() => {
		if (cachedProvider === entry) cachedProvider = null;
	});
	return provider;
}

export const resetOidcCache = () => {
	cachedProvider = null;
};

// --- Logins in progress --------------------------------------------------------

type PendingLogin = {
	nonce: string;
	verifier: string;
	binding: string;
	invite: string | null;
	next: string | null;
	expiresAt: number;
};

// In memory, like the rate limits: a restart only abandons logins in progress.
const pending = new Map<string, PendingLogin>();

function prunePending(now: number) {
	for (const [state, login] of pending) {
		if (login.expiresAt <= now) pending.delete(state);
	}
	for (const state of pending.keys()) {
		if (pending.size < MAX_PENDING_LOGINS) break;
		pending.delete(state);
	}
}

const constantTimeEqual = (a: string, b: string) => {
	const x = new TextEncoder().encode(a);
	const y = new TextEncoder().encode(b);
	if (x.length !== y.length) return false;
	let diff = 0;
	for (let i = 0; i < x.length; i++) {
		diff |= (x[i] as number) ^ (y[i] as number);
	}
	return diff === 0;
};

// Removing the entry is what makes a state single-use. Only the browser that
// started the login may use it up: anyone else who has seen the state in an address
// can't cancel the real person's login by presenting it.
function takePending(state: string, binding: string | undefined) {
	const login = pending.get(state);
	if (!login || !binding || !constantTimeEqual(login.binding, binding)) {
		return null;
	}
	pending.delete(state);
	return login.expiresAt > Date.now() ? login : null;
}

export async function beginOidcLogin(
	config: OidcConfig,
	options: { invite: string | null; next: string | null },
) {
	const { as } = await providerFor(config);

	const state = oauth.generateRandomState();
	const nonce = oauth.generateRandomNonce();
	const verifier = oauth.generateRandomCodeVerifier();
	const binding = oauth.generateRandomState();

	const now = Date.now();
	if (pending.size >= MAX_PENDING_LOGINS) prunePending(now);
	pending.set(state, {
		nonce,
		verifier,
		binding,
		invite: options.invite,
		next: options.next,
		expiresAt: now + LOGIN_LIFETIME_MS,
	});

	const url = new URL(as.authorization_endpoint as string);
	url.searchParams.set("client_id", config.clientId);
	url.searchParams.set("redirect_uri", config.redirectUri);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("scope", "openid email profile");
	url.searchParams.set("state", state);
	url.searchParams.set("nonce", nonce);
	url.searchParams.set(
		"code_challenge",
		await oauth.calculatePKCECodeChallenge(verifier),
	);
	url.searchParams.set("code_challenge_method", "S256");

	return { url: url.href, binding, state };
}

export type OidcClaims = {
	sub: string;
	email: string | null;
	emailVerified: boolean;
	name: string | null;
	preferredUsername: string | null;
};

export type OidcOutcome =
	| {
			ok: true;
			claims: OidcClaims;
			invite: string | null;
			next: string | null;
	  }
	| { ok: false; invite: string | null; error: "failed" | "cancelled" };

const asString = (value: unknown) =>
	typeof value === "string" && value.trim() ? value.trim() : null;

// Handles what the provider sent back. Checks the state, which is only good once and
// only for the browser that started the login, trades the code for tokens, and then
// validates the ID token: signature against the provider's keys, issuer, audience,
// expiry and nonce.
export async function finishOidcLogin(
	config: OidcConfig,
	params: URLSearchParams,
	binding: string | undefined,
): Promise<OidcOutcome> {
	const state = params.get("state");
	const login = state ? takePending(state, binding) : null;
	if (!login) return { ok: false, invite: null, error: "failed" };
	const fail = (error: "failed" | "cancelled" = "failed"): OidcOutcome => ({
		ok: false,
		invite: login.invite,
		error,
	});

	if (params.get("error") === "access_denied") return fail("cancelled");

	try {
		const { as, keys } = await providerFor(config);
		const client: oauth.Client = {
			client_id: config.clientId,
			[oauth.clockSkew]: CLOCK_SKEW_SECONDS,
		};
		// Providers differ in how they want the secret sent.
		const methods = as.token_endpoint_auth_methods_supported;
		const clientAuth =
			methods &&
			!methods.includes("client_secret_basic") &&
			methods.includes("client_secret_post")
				? oauth.ClientSecretPost(config.clientSecret)
				: oauth.ClientSecretBasic(config.clientSecret);

		const callback = oauth.validateAuthResponse(
			as,
			client,
			params,
			state as string,
		);
		const response = await oauth.authorizationCodeGrantRequest(
			as,
			client,
			clientAuth,
			callback,
			config.redirectUri,
			login.verifier,
			requestOptions(config),
		);
		const tokens = await oauth.processAuthorizationCodeResponse(
			as,
			client,
			response,
			{ expectedNonce: login.nonce, requireIdToken: true },
		);

		// The library checks the token's claims but not its signature, so that's done
		// here against the provider's published keys.
		const supported = as.id_token_signing_alg_values_supported ?? ["RS256"];
		const algorithms = supported.filter((a) => SIGNING_ALGORITHMS.includes(a));
		const { payload } = await jwtVerify(tokens.id_token as string, keys, {
			issuer: as.issuer,
			audience: config.clientId,
			algorithms: algorithms.length > 0 ? algorithms : ["RS256"],
			clockTolerance: CLOCK_SKEW_SECONDS,
			requiredClaims: ["exp", "iat", "sub"],
		});
		const claims = readClaims(payload);
		if (!claims || payload.nonce !== login.nonce) return fail();
		return { ok: true, claims, invite: login.invite, next: login.next };
	} catch (error) {
		// The provider's own error code helps whoever set this up, and holds no secret.
		const code =
			error instanceof oauth.ResponseBodyError ? ` (${error.error})` : "";
		utils.logger.warn(
			`OpenID Connect sign-in failed: ${error instanceof Error ? error.message : String(error)}${code}`,
		);
		return fail();
	}
}

function readClaims(payload: JWTPayload): OidcClaims | null {
	const sub = asString(payload.sub);
	if (!sub || sub.length > 255) return null;
	return {
		sub,
		email: asString(payload.email)?.toLowerCase() ?? null,
		// Only a real boolean counts. A provider that doesn't say gets no trust.
		emailVerified: payload.email_verified === true,
		name: asString(payload.name),
		preferredUsername: asString(payload.preferred_username),
	};
}
