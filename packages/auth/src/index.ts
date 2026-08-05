/*
  this was inspired by https://raw.githubusercontent.com/lucia-auth/lucia
*/

import { DB, Utils, type tables } from "@smelp/db";
import { SQL } from "bun";

export class Auth {
  authSessionExpiresInSeconds = 60 * 60 * 24 * 10; // 10 tage
  private sql: SQL;
  private utils

  constructor() {
    this.sql = new DB().sqlite
    this.utils = new Utils()
  }

  async createAuthSession(userId: string): Promise<AuthSessionAndAuthSessionToken> {
    const now = Date.now();

    const id = this.generateRandomId()

    const secret = new Uint8Array(32);
    crypto.getRandomValues(secret);

    const secretHashBuffer = await crypto.subtle.digest("SHA-256", secret);
    const secretHash = new Uint8Array(secretHashBuffer);
    const token = id + "." + secret.toBase64();

    const authSession: tables["auth_session"] = {
      id,
      userId: userId,
      secretHash,
      tokenLastVerifiedAt: now,
      createdAt: now,
    };

    try {
      await this.sql`INSERT INTO auth_session ${this.sql(authSession)}`
    } catch (error) {
      if (error instanceof SQL.SQLiteError) {
        this.utils.logger.fatal(error)
      }
    }

    const authSessionAndAuthSessionToken: AuthSessionAndAuthSessionToken = {
      authSession,
      authSessionToken: token,
    };

    return authSessionAndAuthSessionToken;
  }

  async validateAuthSessionToken(authSessionToken: string): Promise<tables["auth_session"] | null> {
    const now = Date.now();

    const tokenParts = authSessionToken.split(".");
    if (tokenParts.length !== 2) {
      return null;
    }
    const authSessionId = tokenParts[0];
    const encodedAuthSessionSecret = tokenParts[1];

    let authSessionSecret: Uint8Array;
    try {
      authSessionSecret = Uint8Array.fromBase64(encodedAuthSessionSecret!);
    } catch {
      return null;
    }

    const authSession = await this.sql`SELECT * FROM auth_session WHERE id = ${authSessionId}` as tables["auth_session"]

    if (authSession === null) {
      return null;
    }

    if (new Date(now).getTime() - new Date(authSession.tokenLastVerifiedAt).getTime() >= this.authSessionExpiresInSeconds * 1000) {
      return null;
    }

    const authSessionSecretHashBuffer = await crypto.subtle.digest("SHA-256", authSessionSecret as BufferSource);
    const authSessionSecretHash = new Uint8Array(authSessionSecretHashBuffer);
    const secretCorrect = this.constantTimeEqual(authSessionSecretHash, authSession.secretHash);
    if (!secretCorrect) {
      return null;
    }

    if (new Date(now).getTime() - new Date(authSession.tokenLastVerifiedAt).getTime() >= 60 * 60 * 1000) {
      authSession.tokenLastVerifiedAt = now;

      await this.sql`UPDATE auth_session SET tokenLastVerifiedAt = ${now} WHERE id = ${authSession.id}`
    }

    return authSession;
  }

  generateRandomId(): string {
    const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";

    const bytes = new Uint8Array(16);

    crypto.getRandomValues(bytes);

    let id = "";
    for (let i = 0; i < bytes.length; i++) {
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
      c |= a[i]! ^ b[i]!;
    }
    return c === 0;
  }
}

interface AuthSessionAndAuthSessionToken {
  authSession: tables["auth_session"];
  authSessionToken: string;
}
