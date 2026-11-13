import { Auth } from "@smelp/auth";
import { DB, type tables } from "@smelp/db";
import { eventBus } from "@smelp/events";
import { SQL } from "bun";
import { isFirstRun, isSignupOpen, makeFirstAdmin } from "./instance";
import { findUsableInvite } from "./invites";
import type { LinkTarget, OidcClaims } from "./oidc";

const sql = new DB().sqlite;
const auth = new Auth();

export type OidcAccountError =
	| "email_unverified"
	// Every other reason a sign-in can't get in or make an account: no link, sign-up
	// closed, or an email that already belongs to an account. One code and one message
	// for all of them, so the answer doesn't say which accounts exist.
	| "not_linked";

export type OidcAccountResult =
	| { ok: true; userId: string; created: boolean }
	| { ok: false; error: OidcAccountError };

export type OidcLinkResult =
	| { ok: true }
	| { ok: false; error: "session_ended" | "identity_taken" | "already_linked" };

const isUniqueViolation = (error: unknown) =>
	error instanceof SQL.SQLiteError && error.code === "SQLITE_CONSTRAINT_UNIQUE";

const clip = (value: string, max: number) =>
	Array.from(value).slice(0, max).join("");

async function freeDisplayName(tx: typeof sql, wanted: string) {
	for (let attempt = 1; attempt <= 20; attempt++) {
		const suffix = attempt === 1 ? "" : `-${attempt}`;
		const candidate = clip(wanted, 40 - suffix.length) + suffix;
		const taken =
			await tx`SELECT 1 FROM auth_user WHERE displayName = ${candidate}`;
		if (taken.length === 0) return candidate;
	}
	return clip(wanted, 30) + auth.generateRandomId().slice(0, 8);
}

function identityRow(
	userId: string,
	providerId: string,
	sub: string,
): tables["auth_account"] {
	const now = Date.now();
	return {
		id: auth.generateRandomId(),
		userId,
		accountId: sub,
		providerId,
		password: null,
		accessToken: null,
		refreshToken: null,
		accessTokenExpiresAt: null,
		refreshTokenExpiresAt: null,
		scope: null,
		idToken: null,
		createdAt: now,
		updatedAt: now,
	};
}

// Finds or makes the account for a validated sign-in. The decision and its write
// happen in one transaction, so two sign-ins can't both pass the checks and then
// both write. (Helpers that read through `sql` instead of `tx` still run inside it,
// since code inside a transaction is routed to its connection.)
//
//  1. A sign-in matches an account only through an existing link: this provider's
//     `sub`. The email is never used to find an account.
//  2. Otherwise a new account is made, but only where a password sign-up would be
//     allowed (first run, public sign-up open, or a valid invite link), and only for
//     a verified email that no account uses.
//  3. Everything else gets the same "not linked" answer.
export async function resolveOidcAccount(options: {
	providerId: string;
	claims: OidcClaims;
	invite: string | null;
}): Promise<OidcAccountResult> {
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			return (await sql.begin((tx) =>
				resolve(tx as typeof sql, options),
			)) as OidcAccountResult;
		} catch (error) {
			// Lost a race against an identical sign-in: the retry finds what it wrote.
			if (isUniqueViolation(error) && attempt === 0) continue;
			if (isUniqueViolation(error)) return { ok: false, error: "not_linked" };
			throw error;
		}
	}
	return { ok: false, error: "not_linked" };
}

async function resolve(
	tx: typeof sql,
	{
		providerId,
		claims,
		invite,
	}: { providerId: string; claims: OidcClaims; invite: string | null },
): Promise<OidcAccountResult> {
	const now = Date.now();

	const linked = (await tx`
		SELECT userId FROM auth_account
		WHERE providerId = ${providerId} AND accountId = ${claims.sub}
	`) as Pick<tables["auth_account"], "userId">[];
	if (linked[0]) return { ok: true, userId: linked[0].userId, created: false };

	const firstRun = await isFirstRun();
	const allowed =
		firstRun ||
		(await isSignupOpen()) ||
		(invite !== null && (await findUsableInvite(invite)) !== undefined);
	if (!allowed) return { ok: false, error: "not_linked" };

	// Only the claims decide this one, so it says nothing about existing accounts.
	if (!claims.email || !claims.emailVerified) {
		return { ok: false, error: "email_unverified" };
	}

	const taken = await tx`
		SELECT 1 FROM auth_user WHERE lower(email) = ${claims.email}
	`;
	if (taken.length > 0) return { ok: false, error: "not_linked" };

	const localPart = claims.email.split("@")[0] ?? "";
	const fullName = clip(
		claims.name ?? claims.preferredUsername ?? localPart,
		80,
	);
	const displayName = await freeDisplayName(
		tx,
		clip(claims.preferredUsername ?? claims.name ?? localPart, 40) || "user",
	);
	const userId = auth.generateRandomId();
	const user: tables["auth_user"] = {
		id: userId,
		fullName: fullName || displayName,
		displayName,
		email: claims.email,
		createdAt: now,
		updatedAt: now,
		role: "user",
		image: null,
		notifyByEmail: 0,
	};
	await tx`INSERT INTO auth_user ${tx(user)}`;
	await tx`INSERT INTO auth_account ${tx(identityRow(userId, providerId, claims.sub))}`;
	if (firstRun) await makeFirstAdmin(userId);

	return { ok: true, userId, created: true };
}

// Adds a provider identity to the account of someone who is signed in. Everything is
// decided inside the transaction: that the session that started this is still alive,
// that the identity isn't anyone's yet, and that the person has no link already. The
// provider's email doesn't matter, since the person proved who they are by being
// signed in here and at the provider.
export async function linkOidcIdentity(options: {
	providerId: string;
	sub: string;
	target: LinkTarget;
}): Promise<OidcLinkResult> {
	const { providerId, sub, target } = options;
	try {
		return (await sql.begin(async (tx) => {
			const session = await tx`
				SELECT 1 FROM auth_session WHERE id = ${target.sessionId} AND userId = ${target.userId}
			`;
			if (session.length === 0) return { ok: false, error: "session_ended" };

			const owner = (await tx`
				SELECT userId FROM auth_account WHERE providerId = ${providerId} AND accountId = ${sub}
			`) as Pick<tables["auth_account"], "userId">[];
			if (owner[0]) {
				return {
					ok: false,
					error:
						owner[0].userId === target.userId
							? "already_linked"
							: "identity_taken",
				};
			}

			const mine = await tx`
				SELECT 1 FROM auth_account WHERE userId = ${target.userId} AND providerId = ${providerId}
			`;
			if (mine.length > 0) return { ok: false, error: "already_linked" };

			await tx`INSERT INTO auth_account ${tx(identityRow(target.userId, providerId, sub))}`;
			return { ok: true };
		})) as OidcLinkResult;
	} catch (error) {
		// The unique indexes catch what the checks above couldn't.
		if (isUniqueViolation(error)) return { ok: false, error: "identity_taken" };
		throw error;
	}
}

// Makes the session once the sign-in is settled.
export async function startOidcSession(userId: string, created: boolean) {
	const session = await auth.createAuthSession(userId);
	const users =
		(await sql`SELECT displayName FROM auth_user WHERE id = ${userId}`) as Pick<
			tables["auth_user"],
			"displayName"
		>[];

	eventBus.emit({
		type: created ? "auth.signup" : "auth.signin",
		actorId: userId,
		workspaceId: "",
		entityId: "",
		payload: {
			sessionId: session.authSession.id,
			username: users[0]?.displayName ?? "",
		},
	});

	return session;
}
