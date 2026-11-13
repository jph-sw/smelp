import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { createRouterClient } from "@orpc/server";
import {
	type CryptoKey,
	exportJWK,
	generateKeyPair,
	type JWK,
	SignJWT,
} from "jose";

// Imported dynamically so setup.ts points the database at a temp file first.
await import("./setup");
const { Auth } = await import("@smelp/auth");
const { DB } = await import("@smelp/db");
const { router } = await import("../src/router");
const { oidcStart, oidcCallback } = await import("../src/routes/auth/oidc");
const { createSecretToken, hashSecretToken } = await import(
	"../src/lib/tokens"
);
const { oidcCookieName, resetOidcCache, safeLocalPath } = await import(
	"../src/lib/oidc"
);

const sql = new DB().sqlite;
const auth = new Auth();

const CLIENT_ID = "oidc-test-client";
const CLIENT_SECRET = "oidc-test-secret";
const EMAIL_DOMAIN = "oidc-test.example.test";
const PASSWORD = "oidc-test-password-1";
const KEY_ID = "oidc-test-key";

type Scenario = {
	sub: string;
	email?: string | null;
	email_verified?: boolean | string | null;
	name?: string;
	preferred_username?: string;
	issuer?: string;
	audience?: string;
	expiresInSeconds?: number;
	nonce?: string | null;
	signWithOtherKey?: boolean;
	// Signed with the client secret, the way a forged HS256 token would be.
	hmac?: boolean;
};

// --- The fake provider -----------------------------------------------------------

let provider: ReturnType<typeof Bun.serve>;
let issuer = "";
let publicJwk: JWK;
let signingKey: CryptoKey;
let otherKey: CryptoKey;
const scenarios = new Map<string, Scenario>();
const codes = new Map<
	string,
	{ nonce: string; challenge: string; scenario: Scenario }
>();

async function startProvider() {
	const real = await generateKeyPair("RS256");
	signingKey = real.privateKey;
	publicJwk = {
		...(await exportJWK(real.publicKey)),
		kid: KEY_ID,
		alg: "RS256",
		use: "sig",
	};
	// Same key id, different key: what an attacker would sign with.
	otherKey = (await generateKeyPair("RS256")).privateKey;

	provider = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		async fetch(request) {
			const url = new URL(request.url);
			if (url.pathname === "/.well-known/openid-configuration") {
				return Response.json({
					issuer,
					authorization_endpoint: `${issuer}/authorize`,
					token_endpoint: `${issuer}/token`,
					jwks_uri: `${issuer}/jwks`,
					response_types_supported: ["code"],
					subject_types_supported: ["public"],
					id_token_signing_alg_values_supported: ["RS256"],
					token_endpoint_auth_methods_supported: ["client_secret_basic"],
					code_challenge_methods_supported: ["S256"],
				});
			}
			if (url.pathname === "/jwks") return Response.json({ keys: [publicJwk] });

			if (url.pathname === "/authorize") {
				const state = url.searchParams.get("state") ?? "";
				const scenario = scenarios.get(state);
				if (!scenario) return new Response("unknown login", { status: 400 });
				const code = crypto.randomUUID();
				codes.set(code, {
					nonce: url.searchParams.get("nonce") ?? "",
					challenge: url.searchParams.get("code_challenge") ?? "",
					scenario,
				});
				const back = new URL(url.searchParams.get("redirect_uri") ?? "");
				back.searchParams.set("code", code);
				back.searchParams.set("state", state);
				return new Response(null, {
					status: 302,
					headers: { Location: back.href },
				});
			}

			if (url.pathname === "/token" && request.method === "POST") {
				// RFC 6749 has both parts form-encoded before they are joined.
				const basic = (request.headers.get("authorization") ?? "").replace(
					/^Basic /,
					"",
				);
				const [id, secret] = atob(basic)
					.split(":")
					.map((part) => decodeURIComponent(part));
				if (id !== CLIENT_ID || secret !== CLIENT_SECRET) {
					return Response.json({ error: "invalid_client" }, { status: 401 });
				}
				const form = new URLSearchParams(await request.text());
				const entry = codes.get(form.get("code") ?? "");
				codes.delete(form.get("code") ?? "");
				const verifier = form.get("code_verifier") ?? "";
				const challenge = createHash("sha256")
					.update(verifier)
					.digest("base64url");
				if (!entry || challenge !== entry.challenge) {
					return Response.json({ error: "invalid_grant" }, { status: 400 });
				}
				const { scenario } = entry;
				const claims: Record<string, unknown> = {
					email: scenario.email,
					email_verified: scenario.email_verified,
					name: scenario.name,
					preferred_username: scenario.preferred_username,
				};
				if (scenario.nonce !== null) {
					claims.nonce = scenario.nonce ?? entry.nonce;
				}
				const idToken = await new SignJWT(claims)
					.setProtectedHeader({
						alg: scenario.hmac ? "HS256" : "RS256",
						kid: KEY_ID,
					})
					.setIssuer(scenario.issuer ?? issuer)
					.setAudience(scenario.audience ?? CLIENT_ID)
					.setSubject(scenario.sub)
					.setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
					.setExpirationTime(
						Math.floor(Date.now() / 1000) + (scenario.expiresInSeconds ?? 300),
					)
					.sign(
						scenario.hmac
							? new TextEncoder().encode(CLIENT_SECRET)
							: scenario.signWithOtherKey
								? otherKey
								: signingKey,
					);
				return Response.json({
					access_token: "not-used",
					token_type: "Bearer",
					expires_in: 300,
					id_token: idToken,
				});
			}
			return new Response("Not found", { status: 404 });
		},
	});
	issuer = `http://127.0.0.1:${provider.port}`;
}

// --- Driving the flow -------------------------------------------------------------

let ipCounter = 0;
const nextIp = () => {
	ipCounter += 1;
	return `203.0.113.${ipCounter}`;
};

const cookieOf = (response: Response, name: string) => {
	const header = response.headers
		.getSetCookie()
		.find((cookie) => cookie.startsWith(`${name}=`));
	return header;
};
const cookieValue = (header: string | undefined) => {
	const value = header?.split(";")[0]?.split("=").slice(1).join("=");
	return value === undefined ? undefined : decodeURIComponent(value);
};

type Outcome = {
	location: string;
	error: string | null;
	sessionToken: string | undefined;
	sessionCookie: string | undefined;
	callbackUrl: string;
	loginCookie: string;
	// The result of a link attempt, which ends in account settings.
	oidc: string | null;
};

// Start and visit the provider, which hands back the address to return to.
async function begin(scenario: Scenario, query = "") {
	const started = await oidcStart(
		new Request(`http://app.test/api/auth/oidc/start${query}`),
		nextIp(),
	);
	expect(started.status).toBe(302);
	const authorizeUrl = new URL(started.headers.get("location") ?? "");
	const state = authorizeUrl.searchParams.get("state") ?? "";
	scenarios.set(state, scenario);

	const visited = await fetch(authorizeUrl, { redirect: "manual" });
	return {
		started,
		state,
		callbackUrl: visited.headers.get("location") ?? "",
		loginCookie: cookieValue(cookieOf(started, oidcCookieName(state))) ?? "",
	};
}

// Start, visit the provider, and come back to the callback, like a browser would.
async function signInWith(
	scenario: Scenario,
	options: { query?: string; cookie?: "keep" | "drop" | string } = {},
): Promise<Outcome> {
	const { callbackUrl, loginCookie } = await begin(scenario, options.query);
	return await finishAt(callbackUrl, loginCookie, options.cookie);
}

async function finishAt(
	callbackUrl: string,
	loginCookie: string,
	cookie: "keep" | "drop" | string = "keep",
	// The browser's own session, sent along when someone is signed in.
	authToken?: string,
): Promise<Outcome> {
	const name = oidcCookieName(
		new URL(callbackUrl).searchParams.get("state") ?? "",
	);
	const cookies: string[] = [];
	if (cookie === "keep") cookies.push(`${name}=${loginCookie}`);
	else if (cookie !== "drop") cookies.push(`${name}=${cookie}`);
	if (authToken) cookies.push(`auth_session=${encodeURIComponent(authToken)}`);
	const headers = new Headers();
	if (cookies.length > 0) headers.set("cookie", cookies.join("; "));
	const response = await oidcCallback(
		new Request(callbackUrl, { headers }),
		nextIp(),
	);
	const location = response.headers.get("location") ?? "";
	const session = cookieOf(response, "auth_session");
	return {
		location,
		error: new URL(location, "http://app.test").searchParams.get("oidcError"),
		sessionToken: cookieValue(session),
		sessionCookie: session,
		callbackUrl,
		loginCookie,
		oidc: new URL(location, "http://app.test").searchParams.get("oidc"),
	};
}

// Someone signed in presses "Link": the server starts the flow for their session.
async function beginLink(token: string, scenario: Scenario) {
	const resHeaders = new Headers();
	const client = createRouterClient(router, {
		context: {
			headers: new Headers({ cookie: `auth_session=${token}` }),
			ip: nextIp(),
			resHeaders,
		},
	});
	const { url } = await client.auth.startOidcLink();
	const authorizeUrl = new URL(url);
	const state = authorizeUrl.searchParams.get("state") ?? "";
	scenarios.set(state, scenario);
	const visited = await fetch(authorizeUrl, { redirect: "manual" });
	const setCookie =
		resHeaders
			.getSetCookie()
			.find((value) => value.startsWith(`${oidcCookieName(state)}=`)) ?? "";
	return {
		state,
		resHeaders,
		callbackUrl: visited.headers.get("location") ?? "",
		loginCookie: cookieValue(setCookie) ?? "",
	};
}

async function linkIdentity(
	token: string,
	scenario: Scenario,
	authToken: string | undefined = token,
) {
	const link = await beginLink(token, scenario);
	return await finishAt(link.callbackUrl, link.loginCookie, "keep", authToken);
}

// --- Test data ---------------------------------------------------------------------

let counter = 0;
const unique = (prefix: string) => {
	counter += 1;
	return `oidc-${prefix}-${counter}`;
};

async function passwordUser(prefix: string) {
	const name = unique(prefix);
	const email = `${name}@${EMAIL_DOMAIN}`;
	const { user, session } = await auth.signUp(email, name, name, PASSWORD);
	return { id: user.id, email, token: session.authSessionToken };
}

// Someone with a password account who has linked the provider from settings.
async function linkedUser(prefix: string) {
	const person = await passwordUser(prefix);
	const sub = unique("sub");
	const result = await linkIdentity(person.token, verified(sub, person.email));
	expect(result.oidc).toBe("linked");
	return { ...person, sub };
}

const userByEmail = async (email: string) =>
	(
		await sql`SELECT id, displayName, fullName, role FROM auth_user WHERE email = ${email}`
	)[0] as
		| { id: string; displayName: string; fullName: string; role: string }
		| undefined;

const identitiesOf = async (userId: string) =>
	(await sql`
		SELECT providerId, accountId FROM auth_account
		WHERE userId = ${userId} AND providerId LIKE 'oidc:%'
	`) as { providerId: string; accountId: string }[];

const sessionUser = async (token: string | undefined) =>
	token ? (await auth.validateAuthSessionToken(token))?.userId : undefined;

const setSignupOpen = (open: boolean) =>
	sql`UPDATE instance_setting SET value = ${String(open)} WHERE key = 'signupOpen'`;

const clientFor = (token?: string) =>
	createRouterClient(router, {
		context: {
			headers: new Headers(token ? { cookie: `auth_session=${token}` } : {}),
			ip: nextIp(),
		},
	});

let admin: Awaited<ReturnType<typeof passwordUser>>;
let workspaceId: string;
const savedEnv: Record<string, string | undefined> = {};
const ENV_KEYS = [
	"OIDC_ISSUER_URL",
	"OIDC_CLIENT_ID",
	"OIDC_CLIENT_SECRET",
	"OIDC_BUTTON_LABEL",
	"APP_URL",
	"SECURE_COOKIES",
];

beforeAll(async () => {
	await startProvider();
	for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
	process.env.OIDC_ISSUER_URL = issuer;
	process.env.OIDC_CLIENT_ID = CLIENT_ID;
	process.env.OIDC_CLIENT_SECRET = CLIENT_SECRET;
	process.env.OIDC_BUTTON_LABEL = "Sign in with Testprovider";
	process.env.APP_URL = "https://smelp.example.test";
	process.env.SECURE_COOKIES = "false";
	resetOidcCache();

	// Keeps this from being the first run, which would allow any sign-up.
	admin = await passwordUser("admin");
	await setSignupOpen(false);
	const workspace = await clientFor(admin.token).workspace.create({
		name: "oidc-test-workspace",
	});
	workspaceId = workspace.id;
});

afterAll(async () => {
	provider.stop(true);
	for (const key of ENV_KEYS) {
		if (savedEnv[key] === undefined) delete process.env[key];
		else process.env[key] = savedEnv[key];
	}
	resetOidcCache();
	await setSignupOpen(false);
	// Straight to the tables: the delete route's own activity entry would be written
	// after the rows it points at are gone.
	await sql`DELETE FROM auth_space WHERE ownerId = ${admin.id}`;
	await sql`DELETE FROM auth_user WHERE email LIKE ${`%@${EMAIL_DOMAIN}`}`;
});

const verified = (sub: string, email: string, extra: Partial<Scenario> = {}) =>
	({
		sub,
		email,
		email_verified: true,
		name: "Test Person",
		preferred_username: unique("name"),
		...extra,
	}) satisfies Scenario;

// --- Tests -------------------------------------------------------------------------

describe("setup", () => {
	test("the sign-in options tell the web app about the button, and nothing else", async () => {
		const status = await clientFor().auth.signInOptions();
		expect(status.oidc).toEqual({ label: "Sign in with Testprovider" });
		expect(JSON.stringify(status)).not.toContain(CLIENT_SECRET);
	});

	test("starting sends the browser to the provider with PKCE, state and nonce", async () => {
		const response = await oidcStart(
			new Request("http://app.test/api/auth/oidc/start"),
			nextIp(),
		);
		expect(response.status).toBe(302);
		const url = new URL(response.headers.get("location") ?? "");
		expect(url.origin + url.pathname).toBe(`${issuer}/authorize`);
		const params = url.searchParams;
		expect(params.get("client_id")).toBe(CLIENT_ID);
		expect(params.get("response_type")).toBe("code");
		expect(params.get("redirect_uri")).toBe(
			"https://smelp.example.test/api/auth/oidc/callback",
		);
		expect(params.get("code_challenge_method")).toBe("S256");
		expect(params.get("code_challenge")?.length).toBeGreaterThanOrEqual(43);
		expect(params.get("state")?.length).toBeGreaterThanOrEqual(32);
		expect(params.get("nonce")?.length).toBeGreaterThanOrEqual(32);
		expect(params.get("scope")).toContain("openid");

		const cookie =
			response.headers
				.getSetCookie()
				.find((value) => value.startsWith("oidc_login_")) ?? "";
		expect(cookie).toContain("HttpOnly");
		expect(cookie).toContain("SameSite=Lax");
		expect(cookie).toContain("Path=/api/auth/oidc");
	});

	test("every login gets its own state, nonce and challenge", async () => {
		const first = await oidcStart(
			new Request("http://app.test/api/auth/oidc/start"),
			nextIp(),
		);
		const second = await oidcStart(
			new Request("http://app.test/api/auth/oidc/start"),
			nextIp(),
		);
		const a = new URL(first.headers.get("location") ?? "").searchParams;
		const b = new URL(second.headers.get("location") ?? "").searchParams;
		for (const key of ["state", "nonce", "code_challenge"]) {
			expect(a.get(key)).not.toBe(b.get(key));
		}
	});

	test("without the settings the endpoints don't exist and the status says so", async () => {
		const saved = process.env.OIDC_CLIENT_SECRET;
		delete process.env.OIDC_CLIENT_SECRET;
		try {
			expect((await clientFor().auth.signInOptions()).oidc).toBeNull();
			const start = await oidcStart(
				new Request("http://app.test/api/auth/oidc/start"),
				nextIp(),
			);
			expect(start.status).toBe(404);
			const callback = await oidcCallback(
				new Request("http://app.test/api/auth/oidc/callback?state=x&code=y"),
				nextIp(),
			);
			expect(callback.status).toBe(404);
		} finally {
			process.env.OIDC_CLIENT_SECRET = saved;
		}
	});

	test("a plain http issuer is refused unless it is on this machine", async () => {
		const saved = process.env.OIDC_ISSUER_URL;
		process.env.OIDC_ISSUER_URL = "http://idp.example.test";
		try {
			expect((await clientFor().auth.signInOptions()).oidc).toBeNull();
		} finally {
			process.env.OIDC_ISSUER_URL = saved;
		}
	});
});

describe("signing in never links by email", () => {
	test("a verified email that belongs to an account gets the generic answer and no session", async () => {
		const person = await passwordUser("no-auto");
		const result = await signInWith(verified(unique("sub"), person.email));
		expect(result.error).toBe("not_linked");
		expect(result.sessionToken).toBeUndefined();
		expect(await identitiesOf(person.id)).toHaveLength(0);

		// And the person's own password and sessions are untouched.
		expect(await sessionUser(person.token)).toBe(person.id);
		const viaPassword = await clientFor().auth.signIn({
			email: person.email,
			password: PASSWORD,
		});
		expect(viaPassword.user.id).toBe(person.id);
	});

	test("the answer is identical whether or not an account has the email", async () => {
		await setSignupOpen(false);
		const person = await passwordUser("same-answer");
		const known = await signInWith(verified(unique("sub"), person.email));
		const unknown = await signInWith(
			verified(unique("sub"), `nobody-${unique("x")}@${EMAIL_DOMAIN}`),
		);
		expect(known.location).toBe(unknown.location);
		expect(known.location).toBe("/signin?oidcError=not_linked");
		expect(known.sessionToken).toBeUndefined();
		expect(unknown.sessionToken).toBeUndefined();
	});

	test("with sign-up open, an email that has an account still gets that answer", async () => {
		await setSignupOpen(true);
		try {
			const person = await passwordUser("open-exists");
			const result = await signInWith(verified(unique("sub"), person.email));
			expect(result.error).toBe("not_linked");
			expect(result.sessionToken).toBeUndefined();
			expect(await identitiesOf(person.id)).toHaveLength(0);

			// Even in other case.
			const upper = await signInWith(
				verified(unique("sub"), person.email.toUpperCase()),
			);
			expect(upper.error).toBe("not_linked");
			const users =
				await sql`SELECT 1 FROM auth_user WHERE lower(email) = ${person.email}`;
			expect(users).toHaveLength(1);
		} finally {
			await setSignupOpen(false);
		}
	});

	test("an unverified or missing email gives the same answer for any email while sign-up is closed", async () => {
		await setSignupOpen(false);
		const person = await passwordUser("unverified");
		const sub = unique("sub");
		const results = [];
		for (const email_verified of [false, "true", null, undefined]) {
			results.push(
				await signInWith({ sub, email: person.email, email_verified }),
			);
		}
		results.push(await signInWith({ sub: unique("sub") }));
		for (const result of results) {
			expect(result.error).toBe("not_linked");
			expect(result.sessionToken).toBeUndefined();
		}
		expect(await identitiesOf(person.id)).toHaveLength(0);
	});
});

describe("signing in to a linked account", () => {
	test("matches by sub, whatever the email says now", async () => {
		const person = await linkedUser("by-sub");
		const later = await signInWith({
			sub: person.sub,
			email: `somebody-else@${EMAIL_DOMAIN}`,
			email_verified: false,
		});
		expect(later.error).toBeNull();
		expect(later.location).toBe("/");
		expect(await sessionUser(later.sessionToken)).toBe(person.id);
		expect(await userByEmail(`somebody-else@${EMAIL_DOMAIN}`)).toBeUndefined();
	});

	test("the password keeps working next to the link", async () => {
		const person = await linkedUser("both");
		const viaPassword = await clientFor().auth.signIn({
			email: person.email,
			password: PASSWORD,
		});
		expect(viaPassword.user.id).toBe(person.id);
		// Linking doesn't end any session.
		expect(await sessionUser(person.token)).toBe(person.id);
	});
});

describe("linking from account settings", () => {
	test("attaches the identity to the signed-in account, whatever email the provider has", async () => {
		const person = await passwordUser("link");
		const sub = unique("sub");
		const options = await clientFor(person.token).auth.linkedAccounts();
		expect(options.linkable).toEqual({ name: "Testprovider" });

		// The provider's email is a different one, and isn't even verified.
		const result = await linkIdentity(person.token, {
			sub,
			email: `elsewhere-${unique("e")}@${EMAIL_DOMAIN}`,
			email_verified: false,
		});
		expect(result.oidc).toBe("linked");
		expect(result.location).toBe("/account?oidc=linked");
		expect(result.sessionToken).toBeUndefined();
		expect(await identitiesOf(person.id)).toEqual([
			{ providerId: `oidc:${issuer}`, accountId: sub },
		]);
		expect(
			(await clientFor(person.token).auth.linkedAccounts()).linkable,
		).toBeNull();

		const signedIn = await signInWith({ sub });
		expect(await sessionUser(signedIn.sessionToken)).toBe(person.id);
	});

	test("the target is the session that started it, kept on the server", async () => {
		const a = await passwordUser("bound-a");
		const b = await passwordUser("bound-b");
		const link = await beginLink(a.token, verified(unique("sub"), a.email));

		// The browser of someone else, signed in as b, can't finish a's link even
		// with the address.
		const withB = await finishAt(
			link.callbackUrl,
			link.loginCookie,
			"keep",
			b.token,
		);
		expect(withB.error).toBe("session_ended");
		expect(await identitiesOf(a.id)).toHaveLength(0);
		expect(await identitiesOf(b.id)).toHaveLength(0);
	});

	test("starting needs a session and offers nothing without the settings", async () => {
		await expect(clientFor().auth.startOidcLink()).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
		const saved = process.env.OIDC_CLIENT_SECRET;
		delete process.env.OIDC_CLIENT_SECRET;
		try {
			const person = await passwordUser("link-off");
			await expect(
				clientFor(person.token).auth.startOidcLink(),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
			expect(
				(await clientFor(person.token).auth.linkedAccounts()).linkable,
			).toBeNull();
		} finally {
			process.env.OIDC_CLIENT_SECRET = saved;
		}
	});

	test("refuses an identity that already belongs to another account", async () => {
		const owner = await linkedUser("owner");
		const other = await passwordUser("grabber");
		const result = await linkIdentity(
			other.token,
			verified(owner.sub, other.email),
		);
		expect(result.oidc).toBe("identity_taken");
		expect(await identitiesOf(other.id)).toHaveLength(0);
		expect(await identitiesOf(owner.id)).toHaveLength(1);
	});

	test("refuses a second identity for an account that is already linked", async () => {
		const person = await linkedUser("twice");
		await expect(
			clientFor(person.token).auth.startOidcLink(),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });

		// A flow started before the link was made can't add a second one either.
		const other = await passwordUser("twice-late");
		const late = await beginLink(
			other.token,
			verified(unique("sub"), other.email),
		);
		await linkIdentity(other.token, verified(unique("sub"), other.email));
		const result = await finishAt(
			late.callbackUrl,
			late.loginCookie,
			"keep",
			other.token,
		);
		expect(result.oidc).toBe("already_linked");
		expect(await identitiesOf(other.id)).toHaveLength(1);
	});

	test("refuses to finish when the session is gone", async () => {
		const person = await passwordUser("gone");
		const sub = unique("sub");
		const link = await beginLink(person.token, verified(sub, person.email));

		const signedOut = await finishAt(
			link.callbackUrl,
			link.loginCookie,
			"keep",
		);
		expect(signedOut.error).toBe("session_ended");

		// Same with a session that was ended on the server in the meantime.
		const second = await beginLink(person.token, verified(sub, person.email));
		await auth.invalidateAuthSession(
			(await auth.validateAuthSessionToken(person.token))?.id ?? "",
		);
		const ended = await finishAt(
			second.callbackUrl,
			second.loginCookie,
			"keep",
			person.token,
		);
		expect(ended.error).toBe("session_ended");
		expect(await identitiesOf(person.id)).toHaveLength(0);
	});

	test("the state is single-use and belongs to the browser that started it", async () => {
		const person = await passwordUser("link-state");
		const sub = unique("sub");
		const link = await beginLink(person.token, verified(sub, person.email));

		const stranger = await finishAt(
			link.callbackUrl,
			link.loginCookie,
			"drop",
			person.token,
		);
		expect(stranger.error).toBe("failed");
		const wrong = await finishAt(
			link.callbackUrl,
			link.loginCookie,
			"someone-elses-binding",
			person.token,
		);
		expect(wrong.error).toBe("failed");
		expect(await identitiesOf(person.id)).toHaveLength(0);

		const real = await finishAt(
			link.callbackUrl,
			link.loginCookie,
			"keep",
			person.token,
		);
		expect(real.oidc).toBe("linked");

		const replay = await finishAt(
			link.callbackUrl,
			link.loginCookie,
			"keep",
			person.token,
		);
		expect(replay.error).toBe("failed");
		expect(await identitiesOf(person.id)).toHaveLength(1);
	});

	test("a link flow can't be finished as a sign-in, or the other way round", async () => {
		const victim = await passwordUser("cross");
		const attacker = await passwordUser("cross-attacker");
		// The attacker's own link flow, visited by the victim's browser without the
		// attacker's binding cookie.
		const link = await beginLink(
			attacker.token,
			verified(unique("sub"), attacker.email),
		);
		const result = await finishAt(
			link.callbackUrl,
			link.loginCookie,
			"drop",
			victim.token,
		);
		expect(result.error).toBe("failed");
		expect(await identitiesOf(victim.id)).toHaveLength(0);
		expect(await identitiesOf(attacker.id)).toHaveLength(0);
	});

	test("two links for one identity at once leave it with one account", async () => {
		const a = await passwordUser("race-a");
		const b = await passwordUser("race-b");
		const sub = unique("sub");
		const [x, y] = await Promise.all([
			linkIdentity(a.token, verified(sub, a.email)),
			linkIdentity(b.token, verified(sub, b.email)),
		]);
		expect([x.oidc, y.oidc].sort()).toEqual(["identity_taken", "linked"]);
		const rows = await sql`
			SELECT userId FROM auth_account WHERE providerId = ${`oidc:${issuer}`} AND accountId = ${sub}
		`;
		expect(rows).toHaveLength(1);
	});
});

describe("new accounts", () => {
	test("are refused while sign-up is closed", async () => {
		await setSignupOpen(false);
		const email = `${unique("closed")}@${EMAIL_DOMAIN}`;
		const result = await signInWith(verified(unique("sub"), email));
		expect(result.error).toBe("not_linked");
		expect(result.sessionToken).toBeUndefined();
		expect(await userByEmail(email)).toBeUndefined();
	});

	test("are made when public sign-up is open", async () => {
		await setSignupOpen(true);
		try {
			const email = `${unique("open")}@${EMAIL_DOMAIN}`;
			const sub = unique("sub");
			const scenario = verified(sub, email, { name: "Opened Up" });
			const result = await signInWith(scenario);

			expect(result.error).toBeNull();
			expect(result.location).toBe("/create-workspace");
			const user = await userByEmail(email);
			expect(user?.fullName).toBe("Opened Up");
			expect(user?.displayName).toBe(scenario.preferred_username);
			expect(user?.role).toBe("user");
			expect(await sessionUser(result.sessionToken)).toBe(user?.id);
			expect(await identitiesOf(user?.id ?? "")).toEqual([
				{ providerId: `oidc:${issuer}`, accountId: sub },
			]);

			// And the same person signing in again lands on the same account.
			const again = await signInWith(scenario);
			expect(await sessionUser(again.sessionToken)).toBe(user?.id);
		} finally {
			await setSignupOpen(false);
		}
	});

	test("are never made from an unverified email", async () => {
		await setSignupOpen(true);
		try {
			const email = `${unique("unv")}@${EMAIL_DOMAIN}`;
			const result = await signInWith({
				sub: unique("sub"),
				email,
				email_verified: false,
			});
			expect(result.error).toBe("email_unverified");
			expect(await userByEmail(email)).toBeUndefined();
		} finally {
			await setSignupOpen(false);
		}
	});

	test("a taken display name gets a suffix instead of failing", async () => {
		await setSignupOpen(true);
		try {
			const wanted = unique("shared-name");
			const people = [];
			for (let i = 0; i < 3; i++) {
				const email = `${unique("dn")}@${EMAIL_DOMAIN}`;
				const result = await signInWith(
					verified(unique("sub"), email, { preferred_username: wanted }),
				);
				expect(result.error).toBeNull();
				people.push((await userByEmail(email))?.displayName);
			}
			expect(people).toEqual([wanted, `${wanted}-2`, `${wanted}-3`]);
		} finally {
			await setSignupOpen(false);
		}
	});

	test("a long name is cut to what a profile allows", async () => {
		await setSignupOpen(true);
		try {
			const email = `${unique("long")}@${EMAIL_DOMAIN}`;
			await signInWith(
				verified(unique("sub"), email, {
					name: "N".repeat(300),
					preferred_username: "u".repeat(300),
				}),
			);
			const user = await userByEmail(email);
			expect(user?.fullName.length).toBe(80);
			expect(user?.displayName.length).toBe(40);
		} finally {
			await setSignupOpen(false);
		}
	});

	test("an invite link lets someone join while sign-up is closed, and the token comes along", async () => {
		const invite = await clientFor(admin.token).workspaceInvites.create({
			workspaceId,
			role: "member",
		});
		const email = `${unique("invited")}@${EMAIL_DOMAIN}`;
		const result = await signInWith(verified(unique("sub"), email), {
			query: `?invite=${encodeURIComponent(invite.token)}`,
		});
		expect(result.error).toBeNull();
		expect(result.location).toBe(`/invite/${encodeURIComponent(invite.token)}`);
		const user = await userByEmail(email);
		expect(await sessionUser(result.sessionToken)).toBe(user?.id);
	});

	test("an invalid invite link doesn't open anything, and the message keeps the link", async () => {
		const email = `${unique("bad-invite")}@${EMAIL_DOMAIN}`;
		const result = await signInWith(verified(unique("sub"), email), {
			query: "?invite=not-a-real-token",
		});
		expect(result.error).toBe("not_linked");
		expect(result.location).toContain("invite=not-a-real-token");
		expect(await userByEmail(email)).toBeUndefined();
	});

	test("two sign-ins for one new identity at once make one account", async () => {
		await setSignupOpen(true);
		try {
			const email = `${unique("race")}@${EMAIL_DOMAIN}`;
			const scenario = verified(unique("sub"), email);
			const [a, b] = await Promise.all([
				signInWith(scenario),
				signInWith(scenario),
			]);
			expect(a.error).toBeNull();
			expect(b.error).toBeNull();
			const users = await sql`SELECT id FROM auth_user WHERE email = ${email}`;
			expect(users).toHaveLength(1);
			expect(await sessionUser(a.sessionToken)).toBe(users[0].id);
			expect(await sessionUser(b.sessionToken)).toBe(users[0].id);
			expect(await identitiesOf(users[0].id)).toHaveLength(1);
		} finally {
			await setSignupOpen(false);
		}
	});

	test("the database refuses a second account row for one identity", async () => {
		const one = await passwordUser("unique-a");
		const two = await passwordUser("unique-b");
		const now = Date.now();
		const row = (userId: string) => ({
			id: crypto.randomUUID(),
			userId,
			accountId: "same-sub",
			providerId: "oidc:https://unique.example.test",
			password: null,
			accessToken: null,
			refreshToken: null,
			accessTokenExpiresAt: null,
			refreshTokenExpiresAt: null,
			scope: null,
			idToken: null,
			createdAt: now,
			updatedAt: now,
		});
		await sql`INSERT INTO auth_account ${sql(row(one.id))}`;
		await expect(
			(async () => {
				await sql`INSERT INTO auth_account ${sql(row(two.id))}`;
			})(),
		).rejects.toMatchObject({ code: "SQLITE_CONSTRAINT_UNIQUE" });
	});
});

describe("ID token validation", () => {
	const rejects = async (scenario: Partial<Scenario>) => {
		await setSignupOpen(true);
		try {
			const email = `${unique("tok")}@${EMAIL_DOMAIN}`;
			const result = await signInWith({
				...verified(unique("sub"), email),
				...scenario,
			});
			expect(result.error).toBe("failed");
			expect(result.sessionToken).toBeUndefined();
			expect(await userByEmail(email)).toBeUndefined();
		} finally {
			await setSignupOpen(false);
		}
	};

	test("a wrong issuer is refused", () =>
		rejects({ issuer: "https://evil.example.test" }));
	test("a wrong audience is refused", () =>
		rejects({ audience: "some-other-client" }));
	test("a token signed with a shared secret instead of the provider's key is refused", () =>
		rejects({ hmac: true }));
	test("a token signed with the wrong key is refused", () =>
		rejects({ signWithOtherKey: true }));
	test("an expired token is refused", () =>
		rejects({ expiresInSeconds: -3600 }));
	test("a wrong nonce is refused", () => rejects({ nonce: "not-my-nonce" }));
	test("a missing nonce is refused", () => rejects({ nonce: null }));

	test("a good token from the same provider is accepted", async () => {
		await setSignupOpen(true);
		try {
			const result = await signInWith(
				verified(unique("sub"), `${unique("ok")}@${EMAIL_DOMAIN}`),
			);
			expect(result.error).toBeNull();
		} finally {
			await setSignupOpen(false);
		}
	});
});

describe("the callback", () => {
	test("a state can be used once", async () => {
		const person = await linkedUser("replay");
		const scenario = verified(person.sub, person.email);
		const first = await signInWith(scenario);
		expect(first.error).toBeNull();

		const replay = await finishAt(first.callbackUrl, first.loginCookie);
		expect(replay.error).toBe("failed");
		expect(replay.sessionToken).toBeUndefined();
	});

	test("two logins started in different tabs can finish in either order", async () => {
		const a = await linkedUser("tab-a");
		const b = await linkedUser("tab-b");
		const first = await begin(verified(a.sub, a.email));
		const second = await begin(verified(b.sub, b.email));

		const secondDone = await finishAt(second.callbackUrl, second.loginCookie);
		const firstDone = await finishAt(first.callbackUrl, first.loginCookie);
		expect(await sessionUser(secondDone.sessionToken)).toBe(b.id);
		expect(await sessionUser(firstDone.sessionToken)).toBe(a.id);
	});

	test("someone presenting a state without the browser's cookie can't use it up", async () => {
		const person = await linkedUser("burn");
		const login = await begin(verified(person.sub, person.email));

		const stranger = await finishAt(
			login.callbackUrl,
			login.loginCookie,
			"drop",
		);
		expect(stranger.error).toBe("failed");

		const real = await finishAt(login.callbackUrl, login.loginCookie);
		expect(real.error).toBeNull();
		expect(await sessionUser(real.sessionToken)).toBe(person.id);
	});

	test("a state nobody issued is refused", async () => {
		const result = await finishAt(
			"https://smelp.example.test/api/auth/oidc/callback?code=abc&state=forged",
			"forged",
		);
		expect(result.error).toBe("failed");
	});

	test("a callback from a different browser than the one that started is refused", async () => {
		const person = await linkedUser("binding");
		const scenario = verified(person.sub, person.email);
		for (const cookie of ["drop", "someone-elses-binding"] as const) {
			const result = await signInWith(scenario, { cookie });
			expect(result.error).toBe("failed");
			expect(result.sessionToken).toBeUndefined();
		}
	});

	test("a provider that reports an error fails cleanly and keeps the invite", async () => {
		const started = await oidcStart(
			new Request("http://app.test/api/auth/oidc/start?invite=abc"),
			nextIp(),
		);
		const state =
			new URL(started.headers.get("location") ?? "").searchParams.get(
				"state",
			) ?? "";
		const cookie = cookieValue(cookieOf(started, oidcCookieName(state))) ?? "";
		const denied = await finishAt(
			`https://smelp.example.test/api/auth/oidc/callback?error=access_denied&state=${state}`,
			cookie,
		);
		expect(denied.error).toBe("cancelled");
		expect(denied.location).toContain("invite=abc");
	});

	test("the session cookie is set the way password sign-in sets it", async () => {
		const person = await linkedUser("cookie");
		const result = await signInWith(verified(person.sub, person.email));
		const cookie = result.sessionCookie ?? "";
		expect(cookie).toContain("HttpOnly");
		expect(cookie).toContain("SameSite=Lax");
		expect(cookie).toContain("Path=/");
		expect(cookie).toContain(`Max-Age=${auth.authSessionExpiresInSeconds}`);
		expect(cookie).not.toContain("Secure");

		const passwordCookie = (
			await (async () => {
				const { setCookie } = await import("@orpc/server/helpers");
				const headers = new Headers();
				setCookie(headers, "auth_session", "x", {
					httpOnly: true,
					secure: false,
					sameSite: "lax",
					path: "/",
					maxAge: auth.authSessionExpiresInSeconds,
				});
				return headers.getSetCookie()[0] ?? "";
			})()
		).replace("auth_session=x", "");
		expect(cookie.replace(/auth_session=[^;]*/, "")).toBe(passwordCookie);

		process.env.SECURE_COOKIES = "true";
		try {
			const other = await linkedUser("cookie-secure");
			const secure = await signInWith(verified(other.sub, other.email));
			expect(secure.sessionCookie).toContain("Secure");
		} finally {
			process.env.SECURE_COOKIES = "false";
		}
	});
});

describe("where people are sent afterwards", () => {
	test("only paths on this site are followed", async () => {
		const person = await linkedUser("redirect");
		const sub = person.sub;
		const cases: [string, string][] = [
			["/projects/abc?tab=1", "/projects/abc?tab=1"],
			["https://evil.example.test/", "/"],
			["//evil.example.test/", "/"],
			["/\\evil.example.test/", "/"],
			["/.//evil.example.test/", "/"],
			["javascript:alert(1)", "/"],
			["evil.example.test", "/"],
			["/%0d%0aSet-Cookie:x=1", "/%0d%0aSet-Cookie:x=1"],
		];
		for (const [next, expected] of cases) {
			const result = await signInWith(verified(sub, person.email), {
				query: `?next=${encodeURIComponent(next)}`,
			});
			expect(result.error).toBeNull();
			expect(result.location).toBe(expected);
		}
	});

	test("safeLocalPath", () => {
		expect(safeLocalPath("/a/b?c=d#e")).toBe("/a/b?c=d#e");
		expect(safeLocalPath("/\tevil")).toBeNull();
		expect(safeLocalPath("/a\nb")).toBeNull();
		expect(safeLocalPath("///evil")).toBeNull();
		expect(safeLocalPath("/\\/evil")).toBeNull();
		// Dot segments that would collapse into another site.
		expect(safeLocalPath("/.//evil.example.test")).toBeNull();
		expect(safeLocalPath("/a/../..//evil.example.test")).toBeNull();
		expect(safeLocalPath("/%2e%2e//evil.example.test")).toBeNull();
		expect(safeLocalPath("/a/./b")).toBe("/a/b");
		expect(safeLocalPath("")).toBeNull();
		expect(safeLocalPath(null)).toBeNull();
		expect(safeLocalPath(`/${"a".repeat(600)}`)).toBeNull();
	});
});

describe("account settings", () => {
	test("shows the linked provider and lets a person with a password unlink it", async () => {
		const person = await linkedUser("unlink");
		const client = clientFor(person.token);

		expect(await client.auth.linkedAccounts()).toEqual({
			hasPassword: true,
			linkable: null,
			providers: [{ label: "Testprovider" }],
		});

		await client.auth.unlinkOidc();
		const after = await client.auth.linkedAccounts();
		expect(after.providers).toEqual([]);
		// And it can be linked again.
		expect(after.linkable).toEqual({ name: "Testprovider" });
		await expect(client.auth.unlinkOidc()).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
	});

	test("won't unlink when it would leave no way to sign in", async () => {
		await setSignupOpen(true);
		try {
			const email = `${unique("only")}@${EMAIL_DOMAIN}`;
			const result = await signInWith(verified(unique("sub"), email));
			const client = clientFor(result.sessionToken);

			expect((await client.auth.linkedAccounts()).hasPassword).toBe(false);
			await expect(client.auth.unlinkOidc()).rejects.toMatchObject({
				code: "BAD_REQUEST",
			});
			expect((await client.auth.linkedAccounts()).providers).toHaveLength(1);
		} finally {
			await setSignupOpen(false);
		}
	});

	test("setting a password works once, and then Change password takes over", async () => {
		await setSignupOpen(true);
		try {
			const email = `${unique("setpw")}@${EMAIL_DOMAIN}`;
			const result = await signInWith(verified(unique("sub"), email));
			const client = clientFor(result.sessionToken);

			await client.auth.setPassword({ newPassword: "first-password-123" });
			await expect(
				client.auth.setPassword({ newPassword: "second-password-123" }),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
			// The first one still stands.
			const viaPassword = await clientFor().auth.signIn({
				email,
				password: "first-password-123",
			});
			expect(viaPassword.user.email).toBe(email);
			await expect(
				clientFor().auth.setPassword({ newPassword: "whatever-password-1" }),
			).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		} finally {
			await setSignupOpen(false);
		}
	});

	test("a password reset gives a provider-only account its first password", async () => {
		await setSignupOpen(true);
		try {
			const email = `${unique("reset")}@${EMAIL_DOMAIN}`;
			const result = await signInWith(verified(unique("sub"), email));
			const user = await userByEmail(email);
			expect(
				(await clientFor(result.sessionToken).auth.linkedAccounts())
					.hasPassword,
			).toBe(false);

			const token = createSecretToken();
			await sql`INSERT INTO auth_password_reset ${sql({
				id: crypto.randomUUID(),
				userId: user?.id,
				tokenHash: hashSecretToken(token),
				createdByUserId: null,
				createdAt: Date.now(),
				expiresAt: Date.now() + 60_000,
				usedAt: null,
			})}`;
			await clientFor().auth.resetPassword({
				token,
				newPassword: "reset-made-password-1",
			});

			const viaPassword = await clientFor().auth.signIn({
				email,
				password: "reset-made-password-1",
			});
			expect(viaPassword.user.id).toBe(user?.id ?? "");
		} finally {
			await setSignupOpen(false);
		}
	});

	test("needs a session", async () => {
		await expect(clientFor().auth.unlinkOidc()).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
		await expect(clientFor().auth.linkedAccounts()).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
	});

	test("one person can't unlink another's identity", async () => {
		const a = await linkedUser("own-a");
		const b = await linkedUser("own-b");

		await clientFor(b.token).auth.unlinkOidc();
		expect(await identitiesOf(b.id)).toHaveLength(0);
		expect(await identitiesOf(a.id)).toHaveLength(1);
		expect(await identitiesOf(a.id)).toHaveLength(1);
	});
});
