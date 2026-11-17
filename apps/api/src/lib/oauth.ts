import { createHash } from "node:crypto";
import { OAuthClientMetadataSchema } from "@modelcontextprotocol/sdk/shared/auth.js";
import { DB, type tables } from "@smelp/db";
import { API_TOKEN_PREFIX } from "./access";
import { appUrl } from "./app-url";
import { RateLimiter } from "./rate-limit";
import { createSecretToken, hashSecretToken } from "./tokens";

const sql = new DB().sqlite;

const REFRESH_TOKEN_PREFIX = "smelpr_";
const ACCESS_TOKEN_SECONDS = 60 * 60;
const CODE_LIFETIME_MS = 10 * 60 * 1000;
const MAX_REDIRECT_URIS = 10;
const MAX_CLIENT_NAME = 100;
const MAX_BODY_LENGTH = 64 * 1024;

const registrationsByIp = new RateLimiter(20, 60 * 60 * 1000);
const tokenRequestsByIp = new RateLimiter(120, 15 * 60 * 1000);

export const mcpResourceUrl = (base: string) => `${base}/mcp`;
export const protectedResourceMetadataUrl = (base: string) =>
	`${base}/.well-known/oauth-protected-resource/mcp`;

// Answers carry no cookies, so any site may read them. That lets MCP clients that
// run in a browser sign in too.
const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
	"Access-Control-Allow-Headers":
		"Authorization, Content-Type, MCP-Protocol-Version",
};

function json(
	body: unknown,
	status = 200,
	headers: Record<string, string> = {},
) {
	return Response.json(body, {
		status,
		headers: { "Cache-Control": "no-store", ...headers },
	});
}

const oauthError = (
	error: string,
	description: string,
	status = 400,
	headers: Record<string, string> = {},
) => json({ error, error_description: description }, status, headers);

function tooManyRequests(retryAfterSeconds: number) {
	return oauthError("invalid_request", "Too many requests", 429, {
		"Retry-After": String(retryAfterSeconds),
	});
}

const requestBase = (request: Request) => appUrl(new URL(request.url).origin);

function protectedResource(request: Request) {
	const base = requestBase(request);
	return json({
		resource: mcpResourceUrl(base),
		authorization_servers: [base],
		bearer_methods_supported: ["header"],
	});
}

function authorizationServer(request: Request) {
	const base = requestBase(request);
	return json({
		issuer: base,
		authorization_endpoint: `${base}/oauth/authorize`,
		token_endpoint: `${base}/oauth/token`,
		registration_endpoint: `${base}/oauth/register`,
		response_types_supported: ["code"],
		grant_types_supported: ["authorization_code", "refresh_token"],
		code_challenge_methods_supported: ["S256"],
		token_endpoint_auth_methods_supported: ["none"],
	});
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const REFUSED_SCHEMES = new Set(["javascript:", "data:", "file:", "vbscript:"]);

// Native apps get their codes back on a loopback port or their own URL scheme
// (RFC 8252). Plain http anywhere else would hand the code to the network.
function allowedRedirectUri(value: string) {
	if (!URL.canParse(value)) return false;
	const url = new URL(value);
	if (url.hash !== "" || REFUSED_SCHEMES.has(url.protocol)) return false;
	if (url.protocol === "http:") return LOOPBACK_HOSTS.has(url.hostname);
	return true;
}

async function readBody(request: Request) {
	const text = await request.text();
	return text.length > MAX_BODY_LENGTH ? null : text;
}

async function register(request: Request, ip: string) {
	const limit = registrationsByIp.consume(ip);
	if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

	const text = await readBody(request);
	let body: unknown;
	try {
		body = text === null ? null : JSON.parse(text);
	} catch {
		body = null;
	}
	const parsed = OAuthClientMetadataSchema.safeParse(body);
	if (!parsed.success) {
		return oauthError(
			"invalid_client_metadata",
			"The client metadata isn't valid",
		);
	}
	const metadata = parsed.data;
	if (
		metadata.token_endpoint_auth_method !== undefined &&
		metadata.token_endpoint_auth_method !== "none"
	) {
		return oauthError(
			"invalid_client_metadata",
			'Only public clients can register, with token_endpoint_auth_method "none"',
		);
	}
	const redirectUris = metadata.redirect_uris;
	if (
		redirectUris.length === 0 ||
		redirectUris.length > MAX_REDIRECT_URIS ||
		!redirectUris.every(allowedRedirectUri)
	) {
		return oauthError(
			"invalid_redirect_uri",
			`Give 1 to ${MAX_REDIRECT_URIS} redirect URIs, each https, http on localhost, or an app's own scheme`,
		);
	}

	const client: tables["oauth_client"] = {
		id: crypto.randomUUID(),
		name:
			metadata.client_name?.trim().slice(0, MAX_CLIENT_NAME) || "MCP client",
		redirectUris: JSON.stringify(redirectUris),
		createdAt: Date.now(),
	};
	await sql`INSERT INTO oauth_client ${sql(client)}`;

	return json(
		{
			...metadata,
			client_id: client.id,
			client_id_issued_at: Math.floor(client.createdAt / 1000),
			client_name: client.name,
			redirect_uris: redirectUris,
			grant_types: ["authorization_code", "refresh_token"],
			response_types: ["code"],
			token_endpoint_auth_method: "none",
		},
		201,
	);
}

const pkceChallenge = (verifier: string) =>
	createHash("sha256").update(verifier).digest("base64url");

function issueTokens() {
	const accessToken = `${API_TOKEN_PREFIX}${createSecretToken()}`;
	const refreshToken = `${REFRESH_TOKEN_PREFIX}${createSecretToken()}`;
	return {
		accessToken,
		refreshToken,
		secretHash: hashSecretToken(accessToken),
		refreshHash: hashSecretToken(refreshToken),
		secretExpiresAt: Date.now() + ACCESS_TOKEN_SECONDS * 1000,
	};
}

const tokenResponse = ({
	accessToken,
	refreshToken,
}: ReturnType<typeof issueTokens>) =>
	json({
		access_token: accessToken,
		token_type: "Bearer",
		expires_in: ACCESS_TOKEN_SECONDS,
		refresh_token: refreshToken,
	});

type Fields = (name: string) => string | undefined;

async function tokenFields(request: Request): Promise<Fields | null> {
	const text = await readBody(request);
	if (text === null) return null;
	if (!request.headers.get("content-type")?.includes("application/json")) {
		const form = new URLSearchParams(text);
		return (name) => form.get(name) ?? undefined;
	}
	try {
		const body: unknown = JSON.parse(text);
		if (typeof body !== "object" || body === null) return null;
		return (name) => {
			const value = (body as Record<string, unknown>)[name];
			return typeof value === "string" ? value : undefined;
		};
	} catch {
		return null;
	}
}

const invalidGrant = () =>
	oauthError("invalid_grant", "The code or refresh token isn't valid");

async function exchangeCode(field: Fields, client: tables["oauth_client"]) {
	const code = field("code");
	const redirectUri = field("redirect_uri");
	const verifier = field("code_verifier");
	if (!code || !redirectUri || !verifier) {
		return oauthError(
			"invalid_request",
			"Send code, redirect_uri and code_verifier",
		);
	}

	const tokens = issueTokens();
	const issued = await sql.begin(async (tx) => {
		// Deleted before it's checked, so a code works once even if the check fails.
		const row = (
			await tx`DELETE FROM oauth_code WHERE codeHash = ${hashSecretToken(code)} RETURNING *`
		)[0] as tables["oauth_code"] | undefined;
		if (
			!row ||
			row.expiresAt <= Date.now() ||
			row.clientId !== client.id ||
			row.redirectUri !== redirectUri ||
			pkceChallenge(verifier) !== row.codeChallenge
		) {
			return false;
		}

		await tx`DELETE FROM api_token WHERE userId = ${row.userId} AND clientId = ${client.id}`;
		const grant: tables["api_token"] = {
			id: crypto.randomUUID(),
			userId: row.userId,
			name: client.name,
			secretHash: tokens.secretHash,
			createdAt: Date.now(),
			lastUsedAt: null,
			expiresAt: null,
			clientId: client.id,
			refreshHash: tokens.refreshHash,
			secretExpiresAt: tokens.secretExpiresAt,
		};
		await tx`INSERT INTO api_token ${tx(grant)}`;
		return true;
	});
	return issued ? tokenResponse(tokens) : invalidGrant();
}

async function refresh(field: Fields, client: tables["oauth_client"]) {
	const refreshToken = field("refresh_token");
	if (!refreshToken) {
		return oauthError("invalid_request", "Send refresh_token");
	}

	const tokens = issueTokens();
	const rotated = await sql`
		UPDATE api_token
		SET secretHash = ${tokens.secretHash},
			refreshHash = ${tokens.refreshHash},
			secretExpiresAt = ${tokens.secretExpiresAt}
		WHERE refreshHash = ${hashSecretToken(refreshToken)}
		  AND clientId = ${client.id}
		RETURNING id
	`;
	return rotated.length === 0 ? invalidGrant() : tokenResponse(tokens);
}

async function token(request: Request, ip: string) {
	const limit = tokenRequestsByIp.consume(ip);
	if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

	const field = await tokenFields(request);
	if (!field) return oauthError("invalid_request", "The request isn't valid");

	const grantType = field("grant_type");
	if (grantType !== "authorization_code" && grantType !== "refresh_token") {
		return oauthError(
			"unsupported_grant_type",
			"Use authorization_code or refresh_token",
		);
	}
	const client = await findClient(field("client_id"));
	if (!client) return oauthError("invalid_client", "Unknown client_id");

	return grantType === "authorization_code"
		? exchangeCode(field, client)
		: refresh(field, client);
}

export async function findClient(clientId: string | undefined) {
	if (!clientId) return undefined;
	return (await sql`SELECT * FROM oauth_client WHERE id = ${clientId}`)[0] as
		| tables["oauth_client"]
		| undefined;
}

type Handler = (request: Request, ip: string) => Response | Promise<Response>;

function endpoint(method: "GET" | "POST", handler: Handler): Handler {
	return async (request, ip) => {
		if (request.method === "OPTIONS") {
			return new Response(null, { status: 204, headers: CORS_HEADERS });
		}
		const response =
			request.method === method
				? await handler(request, ip)
				: new Response("Method not allowed", {
						status: 405,
						headers: { Allow: `${method}, OPTIONS` },
					});
		for (const [name, value] of Object.entries(CORS_HEADERS)) {
			response.headers.set(name, value);
		}
		return response;
	};
}

/** The OAuth endpoints that aren't pages, by path. Signing in is the web app's /oauth/authorize. */
export const oauthRoutes: Record<string, Handler> = {
	"/.well-known/oauth-protected-resource": endpoint("GET", protectedResource),
	"/.well-known/oauth-protected-resource/mcp": endpoint(
		"GET",
		protectedResource,
	),
	"/.well-known/oauth-authorization-server": endpoint(
		"GET",
		authorizationServer,
	),
	"/oauth/register": endpoint("POST", register),
	"/oauth/token": endpoint("POST", token),
};

export type AuthorizationParams = Partial<
	Record<
		| "response_type"
		| "client_id"
		| "redirect_uri"
		| "code_challenge"
		| "code_challenge_method"
		| "state"
		| "resource"
		| "scope",
		string
	>
>;

/*
  Until the client and redirect_uri check out, nothing may send the browser back,
  since the address could belong to anyone (RFC 6749 4.1.2.1). After that, every
  answer goes back to the client, as a code or an error.
*/
export type AuthorizationCheck =
	| { kind: "invalid"; message: string }
	| { kind: "refused"; redirectTo: string }
	| {
			kind: "valid";
			client: tables["oauth_client"];
			redirectUri: string;
			codeChallenge: string;
			state: string | undefined;
	  };

export function redirectWith(
	redirectUri: string,
	params: Record<string, string | undefined>,
) {
	const url = new URL(redirectUri);
	for (const [name, value] of Object.entries(params)) {
		if (value !== undefined) url.searchParams.set(name, value);
	}
	return url.href;
}

const PKCE_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

export async function checkAuthorization(
	params: AuthorizationParams,
	base: string,
): Promise<AuthorizationCheck> {
	const client = await findClient(params.client_id);
	if (!client) {
		return { kind: "invalid", message: "This app isn't registered here." };
	}
	const redirectUri = params.redirect_uri;
	const registered = JSON.parse(client.redirectUris) as string[];
	if (redirectUri === undefined || !registered.includes(redirectUri)) {
		return {
			kind: "invalid",
			message: "This app asked to return to an address it didn't register.",
		};
	}

	const { state } = params;
	const refuse = (error: string, description: string) => ({
		kind: "refused" as const,
		redirectTo: redirectWith(redirectUri, {
			error,
			error_description: description,
			state,
		}),
	});
	if (params.response_type !== "code") {
		return refuse("unsupported_response_type", "Use response_type=code");
	}
	if (
		params.code_challenge === undefined ||
		!PKCE_CHALLENGE.test(params.code_challenge) ||
		params.code_challenge_method !== "S256"
	) {
		return refuse("invalid_request", "PKCE with S256 is required");
	}
	if (
		params.resource !== undefined &&
		params.resource !== mcpResourceUrl(base)
	) {
		return refuse("invalid_target", `The resource is ${mcpResourceUrl(base)}`);
	}

	return {
		kind: "valid",
		client,
		redirectUri,
		codeChallenge: params.code_challenge,
		state,
	};
}

export async function createAuthorizationCode(
	check: Extract<AuthorizationCheck, { kind: "valid" }>,
	userId: string,
) {
	const code = createSecretToken();
	const now = Date.now();
	await sql`DELETE FROM oauth_code WHERE expiresAt <= ${now}`;
	await sql`INSERT INTO oauth_code ${sql({
		codeHash: hashSecretToken(code),
		clientId: check.client.id,
		userId,
		redirectUri: check.redirectUri,
		codeChallenge: check.codeChallenge,
		expiresAt: now + CODE_LIFETIME_MS,
	} satisfies tables["oauth_code"])}`;
	return redirectWith(check.redirectUri, { code, state: check.state });
}
