import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type {
	OAuthClientInformationMixed,
	OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { createRouterClient } from "@orpc/server";

// Imported dynamically so setup.ts points the database at a temp file first.
await import("./setup");
const { Auth } = await import("@smelp/auth");
const { DB } = await import("@smelp/db");
const { router } = await import("../src/router");
const { mcpResponse } = await import("../src/lib/mcp");
const { oauthRoutes } = await import("../src/lib/oauth");

const sql = new DB().sqlite;
const auth = new Auth();

const BASE = "http://smelp.test";
const ENDPOINT = `${BASE}/mcp`;
const IP = "198.18.6.1";
const REDIRECT = "http://127.0.0.1:33418/callback";

async function serve(url: string | URL, init?: RequestInit) {
	const request = new Request(String(url), init);
	const { pathname } = new URL(request.url);
	if (pathname === "/mcp") return mcpResponse(request, IP);
	const route = oauthRoutes[pathname];
	return route
		? route(request, IP)
		: new Response("Not found", { status: 404 });
}

const clientWith = (headers: Record<string, string>) =>
	createRouterClient(router, {
		context: {
			headers: new Headers({ host: "smelp.test", ...headers }),
			ip: IP,
		},
	});

let counter = 0;
async function createUser(displayName: string) {
	counter += 1;
	const { session, user } = await auth.signUp(
		`oauth-${counter}@example.test`,
		`${displayName} Person`,
		`oauth-${displayName}`,
		"correct-horse-battery",
	);
	return {
		id: user.id,
		browser: clientWith({ cookie: `auth_session=${session.authSessionToken}` }),
	};
}
type User = Awaited<ReturnType<typeof createUser>>;

async function register(metadata: Record<string, unknown>) {
	const response = await serve(`${BASE}/oauth/register`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(metadata),
	});
	const body = (await response.json()) as Record<string, unknown>;
	return { status: response.status, body };
}

async function registerClient(name = "Test agent") {
	const { status, body } = await register({
		client_name: name,
		redirect_uris: [REDIRECT],
	});
	expect(status).toBe(201);
	return String(body.client_id);
}

const pkce = () => {
	const verifier = Buffer.from(
		crypto.getRandomValues(new Uint8Array(32)),
	).toString("base64url");
	const challenge = createHash("sha256").update(verifier).digest("base64url");
	return { verifier, challenge };
};

const authorization = (clientId: string, challenge: string) => ({
	response_type: "code",
	client_id: clientId,
	redirect_uri: REDIRECT,
	code_challenge: challenge,
	code_challenge_method: "S256",
	state: "xyz",
	resource: ENDPOINT,
});

async function approve(user: User, clientId: string, challenge: string) {
	const { redirectTo } = await user.browser.oauth.approve(
		authorization(clientId, challenge),
	);
	const url = new URL(redirectTo);
	expect(url.origin + url.pathname).toBe(REDIRECT);
	expect(url.searchParams.get("state")).toBe("xyz");
	return url.searchParams.get("code") ?? "";
}

async function postToken(fields: Record<string, string>) {
	const response = await serve(`${BASE}/oauth/token`, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams(fields),
	});
	const body = (await response.json()) as {
		error?: string;
		access_token: string;
		refresh_token: string;
		expires_in: number;
	};
	return { status: response.status, body };
}

async function signIn(user: User, clientId: string) {
	const { verifier, challenge } = pkce();
	const code = await approve(user, clientId, challenge);
	const { status, body } = await postToken({
		grant_type: "authorization_code",
		code,
		redirect_uri: REDIRECT,
		client_id: clientId,
		code_verifier: verifier,
	});
	expect(status).toBe(200);
	return body;
}

const refresh = (clientId: string, refreshToken: string) =>
	postToken({
		grant_type: "refresh_token",
		refresh_token: refreshToken,
		client_id: clientId,
	});

async function mcpStatus(token: string) {
	const response = await mcpResponse(
		new Request(ENDPOINT, {
			method: "POST",
			headers: {
				authorization: `Bearer ${token}`,
				"content-type": "application/json",
				accept: "application/json, text/event-stream",
			},
			body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
		}),
		IP,
	);
	return response.status;
}

const clients: Client[] = [];
let ada: User;
let grace: User;

beforeAll(async () => {
	ada = await createUser("Ada");
	grace = await createUser("Grace");
});

afterAll(async () => {
	await Promise.all(clients.map((client) => client.close()));
});

test("an MCP client that knows only the URL signs a person in and works as them", async () => {
	const saved: {
		client?: OAuthClientInformationMixed;
		tokens?: OAuthTokens;
		verifier?: string;
		authorizationUrl?: URL;
	} = {};
	const transportFor = () =>
		new StreamableHTTPClientTransport(new URL(ENDPOINT), {
			fetch: serve,
			authProvider: {
				redirectUrl: REDIRECT,
				clientMetadata: {
					client_name: "Claude Code",
					redirect_uris: [REDIRECT],
				},
				state: () => "from-the-client",
				clientInformation: () => saved.client,
				saveClientInformation: (client) => {
					saved.client = client;
				},
				tokens: () => saved.tokens,
				saveTokens: (tokens) => {
					saved.tokens = tokens;
				},
				saveCodeVerifier: (verifier) => {
					saved.verifier = verifier;
				},
				codeVerifier: () => saved.verifier ?? "",
				redirectToAuthorization: (url) => {
					saved.authorizationUrl = url;
				},
			},
		});

	const first = transportFor();
	await expect(
		new Client({ name: "agent", version: "1.0.0" }).connect(first),
	).rejects.toThrow();

	const authorizationUrl = saved.authorizationUrl;
	if (!authorizationUrl)
		throw new Error("the client never sent anyone to sign in");
	expect(authorizationUrl.origin + authorizationUrl.pathname).toBe(
		`${BASE}/oauth/authorize`,
	);
	const params = Object.fromEntries(authorizationUrl.searchParams);

	const consent = await ada.browser.oauth.describe(params);
	expect(consent).toMatchObject({
		kind: "consent",
		clientName: "Claude Code",
		destination: "127.0.0.1:33418",
	});

	const { redirectTo } = await ada.browser.oauth.approve(params);
	const back = new URL(redirectTo);
	expect(back.searchParams.get("state")).toBe("from-the-client");
	await first.finishAuth(back.searchParams.get("code") ?? "");

	const agent = new Client({ name: "agent", version: "1.0.0" });
	await agent.connect(transportFor());
	clients.push(agent);
	const whoami = (await agent.callTool({ name: "whoami", arguments: {} })) as {
		content: { text: string }[];
	};
	expect(JSON.parse(whoami.content[0]?.text ?? "").name).toBe("oauth-Ada");
	const { tools } = await agent.listTools();
	expect(tools.map((tool) => tool.name)).toContain("list_my_work_items");

	expect(await ada.browser.apiTokens.find()).toEqual([
		expect.objectContaining({ name: "Claude Code", oauth: true }),
	]);
});

describe("discovery", () => {
	test("the 401 points at the metadata, which points at the endpoints", async () => {
		const response = await serve(ENDPOINT, { method: "POST" });
		expect(response.status).toBe(401);
		expect(response.headers.get("www-authenticate")).toBe(
			`Bearer resource_metadata="${BASE}/.well-known/oauth-protected-resource/mcp"`,
		);

		const resource = await (
			await serve(`${BASE}/.well-known/oauth-protected-resource/mcp`)
		).json();
		expect(resource).toEqual({
			resource: ENDPOINT,
			authorization_servers: [BASE],
			bearer_methods_supported: ["header"],
		});

		const metadata = await (
			await serve(`${BASE}/.well-known/oauth-authorization-server`)
		).json();
		expect(metadata).toMatchObject({
			issuer: BASE,
			authorization_endpoint: `${BASE}/oauth/authorize`,
			token_endpoint: `${BASE}/oauth/token`,
			registration_endpoint: `${BASE}/oauth/register`,
			code_challenge_methods_supported: ["S256"],
			token_endpoint_auth_methods_supported: ["none"],
		});
	});

	test("browser clients may call the endpoints from any site", async () => {
		const preflight = await serve(`${BASE}/oauth/token`, { method: "OPTIONS" });
		expect(preflight.status).toBe(204);
		expect(preflight.headers.get("access-control-allow-origin")).toBe("*");
		const metadata = await serve(
			`${BASE}/.well-known/oauth-authorization-server`,
		);
		expect(metadata.headers.get("access-control-allow-origin")).toBe("*");
	});
});

describe("registering", () => {
	test("accepts loopback, https and app schemes", async () => {
		const { status, body } = await register({
			client_name: "Cursor",
			redirect_uris: [
				"http://localhost:8080/cb",
				"https://agent.example/cb",
				"cursor://anysphere.cursor-retrieval/oauth/callback",
			],
		});
		expect(status).toBe(201);
		expect(body).toMatchObject({
			client_id: expect.any(String),
			client_id_issued_at: expect.any(Number),
			client_name: "Cursor",
			token_endpoint_auth_method: "none",
		});
	});

	test("refuses addresses that would leak the code", async () => {
		for (const uri of ["http://evil.example/cb", "javascript:alert(1)"]) {
			const { status, body } = await register({ redirect_uris: [uri] });
			expect(status).toBe(400);
			expect(body.error).toMatch(/^invalid_(redirect_uri|client_metadata)$/);
		}
	});

	test("refuses confidential clients", async () => {
		const { status, body } = await register({
			redirect_uris: [REDIRECT],
			token_endpoint_auth_method: "client_secret_basic",
		});
		expect(status).toBe(400);
		expect(body.error).toBe("invalid_client_metadata");
	});
});

describe("the consent page's checks", () => {
	test("an unregistered redirect_uri is shown, never followed", async () => {
		const clientId = await registerClient();
		const result = await ada.browser.oauth.describe({
			...authorization(clientId, pkce().challenge),
			redirect_uri: "http://127.0.0.1:1/elsewhere",
		});
		expect(result.kind).toBe("invalid");
		await expect(
			ada.browser.oauth.approve({
				...authorization(clientId, pkce().challenge),
				redirect_uri: "http://127.0.0.1:1/elsewhere",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	test("a bad request from a trusted client goes back to it as an error", async () => {
		const clientId = await registerClient();
		const result = await ada.browser.oauth.describe({
			...authorization(clientId, pkce().challenge),
			code_challenge_method: "plain",
		});
		if (result.kind !== "redirect") throw new Error(`got ${result.kind}`);
		const url = new URL(result.redirectTo);
		expect(url.searchParams.get("error")).toBe("invalid_request");
		expect(url.searchParams.get("state")).toBe("xyz");
	});

	test("denying sends the client access_denied", async () => {
		const clientId = await registerClient();
		const result = await ada.browser.oauth.describe(
			authorization(clientId, pkce().challenge),
		);
		if (result.kind !== "consent") throw new Error(`got ${result.kind}`);
		const url = new URL(result.denyUrl);
		expect(url.searchParams.get("error")).toBe("access_denied");
		expect(url.searchParams.get("state")).toBe("xyz");
	});

	test("approving takes a browser session, not a bearer token", async () => {
		const clientId = await registerClient();
		const { access_token } = await signIn(ada, clientId);
		const withToken = clientWith({ authorization: `Bearer ${access_token}` });
		await expect(
			withToken.oauth.approve(authorization(clientId, pkce().challenge)),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});
});

describe("exchanging a code", () => {
	test("needs the verifier that matches the challenge", async () => {
		const clientId = await registerClient();
		const { challenge } = pkce();
		const code = await approve(ada, clientId, challenge);
		const { status, body } = await postToken({
			grant_type: "authorization_code",
			code,
			redirect_uri: REDIRECT,
			client_id: clientId,
			code_verifier: pkce().verifier,
		});
		expect(status).toBe(400);
		expect(body.error).toBe("invalid_grant");
	});

	test("works once", async () => {
		const clientId = await registerClient();
		const { verifier, challenge } = pkce();
		const code = await approve(ada, clientId, challenge);
		const fields = {
			grant_type: "authorization_code",
			code,
			redirect_uri: REDIRECT,
			client_id: clientId,
			code_verifier: verifier,
		};
		expect((await postToken(fields)).status).toBe(200);
		const again = await postToken(fields);
		expect(again.status).toBe(400);
		expect(again.body.error).toBe("invalid_grant");
	});

	test("needs the same redirect_uri", async () => {
		const clientId = await registerClient();
		const { verifier, challenge } = pkce();
		const code = await approve(ada, clientId, challenge);
		const { body } = await postToken({
			grant_type: "authorization_code",
			code,
			redirect_uri: "http://127.0.0.1:1/other",
			client_id: clientId,
			code_verifier: verifier,
		});
		expect(body.error).toBe("invalid_grant");
	});

	test("names unknown clients and grant types", async () => {
		expect(
			(await postToken({ grant_type: "authorization_code", client_id: "nope" }))
				.body.error,
		).toBe("invalid_client");
		expect(
			(await postToken({ grant_type: "password", client_id: "nope" })).body
				.error,
		).toBe("unsupported_grant_type");
	});

	test("signing in again replaces the client's earlier grant", async () => {
		const user = await createUser("Again");
		const clientId = await registerClient("Repeat agent");
		const first = await signIn(user, clientId);
		const second = await signIn(user, clientId);
		expect(await mcpStatus(first.access_token)).toBe(401);
		expect(await mcpStatus(second.access_token)).toBe(200);
		expect(await user.browser.apiTokens.find()).toHaveLength(1);
	});
});

describe("tokens", () => {
	test("an expired access token is refused", async () => {
		const clientId = await registerClient();
		const { access_token, expires_in } = await signIn(grace, clientId);
		expect(expires_in).toBe(3600);
		expect(await mcpStatus(access_token)).toBe(200);

		await sql`UPDATE api_token SET secretExpiresAt = ${Date.now() - 1} WHERE clientId = ${clientId}`;
		const response = await serve(ENDPOINT, {
			method: "POST",
			headers: { authorization: `Bearer ${access_token}` },
		});
		expect(response.status).toBe(401);
		expect(response.headers.get("www-authenticate")).toContain(
			'error="invalid_token"',
		);
	});

	test("a refresh rotates both tokens", async () => {
		const clientId = await registerClient();
		const first = await signIn(grace, clientId);
		const { status, body: second } = await refresh(
			clientId,
			first.refresh_token,
		);
		expect(status).toBe(200);
		expect(await mcpStatus(second.access_token)).toBe(200);
		expect(await mcpStatus(first.access_token)).toBe(401);
		expect((await refresh(clientId, first.refresh_token)).body.error).toBe(
			"invalid_grant",
		);
		expect((await refresh(clientId, second.refresh_token)).status).toBe(200);
	});

	test("a refresh token is not a bearer token", async () => {
		const clientId = await registerClient();
		const { refresh_token } = await signIn(grace, clientId);
		expect(await mcpStatus(refresh_token)).toBe(401);
	});

	test("a refresh token works only for its own client", async () => {
		const clientId = await registerClient();
		const otherClient = await registerClient();
		const { refresh_token } = await signIn(grace, clientId);
		expect((await refresh(otherClient, refresh_token)).body.error).toBe(
			"invalid_grant",
		);
	});

	test("revoking the grant signs the client out", async () => {
		const user = await createUser("Revoker");
		const clientId = await registerClient("Revoked agent");
		const { access_token, refresh_token } = await signIn(user, clientId);
		const [grant] = await user.browser.apiTokens.find();
		await user.browser.apiTokens.revoke({ id: grant?.id ?? "" });
		expect(await mcpStatus(access_token)).toBe(401);
		expect((await refresh(clientId, refresh_token)).body.error).toBe(
			"invalid_grant",
		);
	});

	test("personal access tokens still work", async () => {
		const { token } = await ada.browser.apiTokens.create({
			name: "Script",
			expiresInDays: null,
		});
		expect(await mcpStatus(token)).toBe(200);
	});
});
