import { Auth } from "@smelp/auth";
import { DB, type tables } from "@smelp/db";
import { eventBus } from "@smelp/events";
import { SQL } from "bun";
import { isFirstRun, isSignupOpen, makeFirstAdmin } from "./instance";
import { findUsableInvite } from "./invites";
import type { OidcClaims } from "./oidc";

const sql = new DB().sqlite;
const auth = new Auth();

export type OidcAccountError =
	| "email_unverified"
	| "signup_closed"
	// Covers every case where the sign-in can't safely be matched to one account,
	// with a single message so it doesn't say which accounts exist.
	| "no_match";

export type OidcAccountResult =
	| { ok: true; userId: string; created: boolean; passwordRemoved?: boolean }
	| { ok: false; error: OidcAccountError };

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

// The helpers below that read through `sql` instead of `tx` still run inside the
// transaction, since code inside one is routed to its connection.
//
// Finds or makes the account for a validated sign-in. The whole decision and its
// write happen in one transaction, so two sign-ins can't both pass the checks and
// then both write.
//
//  1. An identity already linked to this provider's `sub` signs in to that account,
//     whatever the email says now.
//  2. Otherwise a VERIFIED email that matches exactly one account links to it.
//  3. Otherwise a new account is made, but only where a password sign-up would be
//     allowed: first run, public sign-up open, or a valid invite link.
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
			if (isUniqueViolation(error)) return { ok: false, error: "no_match" };
			throw error;
		}
	}
	return { ok: false, error: "no_match" };
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

	if (!claims.email || !claims.emailVerified) {
		return { ok: false, error: "email_unverified" };
	}

	const matches = (await tx`
		SELECT id FROM auth_user WHERE lower(email) = ${claims.email}
	`) as Pick<tables["auth_user"], "id">[];
	if (matches.length > 1) return { ok: false, error: "no_match" };

	const identity = (userId: string): tables["auth_account"] => ({
		id: auth.generateRandomId(),
		userId,
		accountId: claims.sub,
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
	});

	const match = matches[0];
	if (match) {
		const alreadyLinked = await tx`
			SELECT 1 FROM auth_account WHERE userId = ${match.id} AND providerId = ${providerId}
		`;
		// That person already uses a different identity at this provider.
		if (alreadyLinked.length > 0) return { ok: false, error: "no_match" };

		await tx`INSERT INTO auth_account ${tx(identity(match.id))}`;
		// Sign-up doesn't prove that an address is the person's own, so someone may
		// have registered this one first and chosen the password. The provider has
		// just shown that the address really belongs to the person signing in, so
		// anything that came from before is cut off: the password, the sessions and
		// any reset link. They can set a new password in their account settings.
		const removed = await tx`
			UPDATE auth_account SET password = NULL, updatedAt = ${now}
			WHERE userId = ${match.id} AND providerId = 'password' AND password IS NOT NULL
			RETURNING id
		`;
		await tx`DELETE FROM auth_session WHERE userId = ${match.id}`;
		await tx`DELETE FROM auth_password_reset WHERE userId = ${match.id}`;
		return {
			ok: true,
			userId: match.id,
			created: false,
			passwordRemoved: removed.length > 0,
		};
	}

	const firstRun = await isFirstRun();
	const allowed =
		firstRun ||
		(await isSignupOpen()) ||
		(invite !== null && (await findUsableInvite(invite)) !== undefined);
	if (!allowed) return { ok: false, error: "signup_closed" };

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
	await tx`INSERT INTO auth_account ${tx(identity(userId))}`;
	if (firstRun) await makeFirstAdmin(userId);

	return { ok: true, userId, created: true };
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
