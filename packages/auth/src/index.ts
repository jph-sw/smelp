/*
  this was inspired by https://raw.githubusercontent.com/lucia-auth/lucia
*/

import { DB, type tables } from "@smelp/db";
import { eventBus } from "@smelp/events";
import type { SQL } from "bun";
import { type Permission, roleHasPermission } from "./permission";

export { type Permission, roleHasPermission };

const DUMMY_PASSWORD_HASH = Bun.password.hashSync(crypto.randomUUID(), {
	algorithm: "argon2id",
});

export class Auth {
	authSessionExpiresInSeconds = 60 * 60 * 24 * 10; // 10 tage
	private sql: SQL;

	constructor() {
		this.sql = new DB().sqlite;
	}

	async isInstanceAdmin(userId: string): Promise<boolean> {
		const user = (await this
			.sql`SELECT * FROM auth_user WHERE id = ${userId}`) as tables["auth_user"][];
		return user[0]?.role === "admin";
	}

	hashPassword(password: string): Promise<string> {
		return Bun.password.hash(password, { algorithm: "argon2id" });
	}

	async verifyPassword(userId: string, password: string): Promise<boolean> {
		const accounts = (await this
			.sql`SELECT password FROM auth_account WHERE userId = ${userId} AND providerId = 'password'`) as Pick<
			tables["auth_account"],
			"password"
		>[];
		return Bun.password.verify(
			password,
			accounts[0]?.password ?? DUMMY_PASSWORD_HASH,
		);
	}

	async userHasPermission(
		userId: string,
		spaceId: string,
		permission: Permission,
	): Promise<boolean> {
		if (await this.isInstanceAdmin(userId)) {
			return true;
		}

		const members = (await this
			.sql`SELECT * FROM auth_space_member WHERE spaceId = ${spaceId} AND userId = ${userId}`) as tables["auth_space_member"][];
		const member = members[0];

		if (member == null) {
			return false;
		}

		return roleHasPermission(member.role, permission);
	}

	async signIn(email: string, password: string) {
		let user: tables["auth_user"] | null = null;
		let account: tables["auth_account"] | null = null;

		const users = (await this
			.sql`SELECT * FROM auth_user WHERE email = ${email}`) as tables["auth_user"][];
		user = users[0] ?? null;

		if (user != null) {
			// for now only password is supported
			const accounts = (await this
				.sql`SELECT * FROM auth_account WHERE userId = ${user.id} AND providerId = 'password'`) as tables["auth_account"][];
			account = accounts[0] ?? null;
		}

		/* always run a verify, even when the user/account is unknown, so that
       response timing and error handling don't reveal whether the email exists */
		const isMatch = await Bun.password.verify(
			password,
			account?.password ?? DUMMY_PASSWORD_HASH,
		);

		if (user == null || account == null || !isMatch) {
			return null;
		}

		const session = await this.createAuthSession(user.id);

		eventBus.emit({
			type: "auth.signin",
			actorId: user.id,
			workspaceId: "",
			entityId: "",
			payload: {
				sessionId: session.authSession.id,
				username: user.displayName,
			},
		});

		return { session, user };
	}

	async signUp(
		email: string,
		fullName: string,
		displayName: string,
		password: string,
		emailVerified = true,
	) {
		const now = Date.now();
		const passwordHash = await Bun.password.hash(password, {
			algorithm: "argon2id",
		});
		const userId = this.generateRandomId();

		const user: tables["auth_user"] = {
			id: userId,
			fullName: fullName,
			displayName: displayName,
			email: email,
			createdAt: now,
			updatedAt: now,
			role: "user",
			image: null,
			notifyByEmail: 0,
			emailVerified: emailVerified ? 1 : 0,
		};

		const account: tables["auth_account"] = {
			id: this.generateRandomId(),
			userId: userId,
			accountId: this.generateRandomId(),
			providerId: "password",
			password: passwordHash,
			createdAt: now,
			updatedAt: now,
			accessToken: null,
			refreshToken: null,
			accessTokenExpiresAt: null,
			refreshTokenExpiresAt: null,
			scope: null,
			idToken: null,
		};

		await this.sql`INSERT INTO auth_user ${this.sql(user)}`;

		await this.sql`INSERT INTO auth_account ${this.sql(account)}`;

		const session = await this.createAuthSession(userId);

		eventBus.emit({
			type: "auth.signup",
			actorId: user.id,
			workspaceId: "",
			entityId: "",
			payload: {
				sessionId: session.authSession.id,
				username: user.displayName,
			},
		});

		return { session, user };
	}

	async createAuthSession(
		userId: string,
	): Promise<AuthSessionAndAuthSessionToken> {
		const now = Date.now();

		const id = this.generateRandomId();

		const secret = new Uint8Array(32);
		crypto.getRandomValues(secret);

		const secretHashBuffer = await crypto.subtle.digest("SHA-256", secret);
		const secretHash = new Uint8Array(secretHashBuffer);
		const token = `${id}.${secret.toBase64()}`;

		const authSession: tables["auth_session"] = {
			id,
			userId: userId,
			secretHash,
			tokenLastVerifiedAt: now,
			createdAt: now,
		};

		await this.sql`INSERT INTO auth_session ${this.sql(authSession)}`;

		const authSessionAndAuthSessionToken: AuthSessionAndAuthSessionToken = {
			authSession,
			authSessionToken: token,
		};

		return authSessionAndAuthSessionToken;
	}

	async validateAuthSessionToken(
		authSessionToken: string,
	): Promise<tables["auth_session"] | null> {
		const now = Date.now();

		const tokenParts = authSessionToken.split(".");
		if (tokenParts.length !== 2) {
			return null;
		}
		const authSessionId = tokenParts[0];
		const encodedAuthSessionSecret = tokenParts[1];

		let authSessionSecret: Uint8Array;
		try {
			authSessionSecret = Uint8Array.fromBase64(encodedAuthSessionSecret ?? "");
		} catch {
			return null;
		}

		const authSessions = (await this
			.sql`SELECT * FROM auth_session WHERE id = ${authSessionId}`) as tables["auth_session"][];
		const authSession = authSessions[0];

		if (authSession == null) {
			return null;
		}

		if (
			new Date(now).getTime() -
				new Date(authSession.tokenLastVerifiedAt).getTime() >=
			this.authSessionExpiresInSeconds * 1000
		) {
			return null;
		}

		const authSessionSecretHashBuffer = await crypto.subtle.digest(
			"SHA-256",
			authSessionSecret as Uint8Array<ArrayBuffer>,
		);
		const authSessionSecretHash = new Uint8Array(authSessionSecretHashBuffer);
		const secretCorrect = this.constantTimeEqual(
			authSessionSecretHash,
			authSession.secretHash,
		);
		if (!secretCorrect) {
			return null;
		}

		if (
			new Date(now).getTime() -
				new Date(authSession.tokenLastVerifiedAt).getTime() >=
			60 * 60 * 1000
		) {
			authSession.tokenLastVerifiedAt = now;

			await this
				.sql`UPDATE auth_session SET tokenLastVerifiedAt = ${now} WHERE id = ${authSession.id}`;
		}

		return authSession;
	}

	async invalidateAuthSession(authSessionId: string): Promise<void> {
		await this.sql`DELETE FROM auth_session WHERE id = ${authSessionId}`;
	}

	generateRandomId(): string {
		const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";

		const bytes = new Uint8Array(16);

		crypto.getRandomValues(bytes);

		let id = "";
		for (let i = 0; i < bytes.length; i++) {
			// biome-ignore lint/style/noNonNullAssertion: <TODO>
			id += alphabet[bytes[i]! >> 3];
		}
		return id;
	}

	constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
		if (a.byteLength !== b.byteLength) {
			return false;
		}
		let c = 0;
		for (let i = 0; i < a.byteLength; i++) {
			// biome-ignore lint/style/noNonNullAssertion: <TODO>
			c |= a[i]! ^ b[i]!;
		}
		return c === 0;
	}
}

interface AuthSessionAndAuthSessionToken {
	authSession: tables["auth_session"];
	authSessionToken: string;
}
