import { createHash } from "node:crypto";

export function createSecretToken() {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return Buffer.from(bytes).toString("base64url");
}

export function hashSecretToken(token: string) {
	return createHash("sha256").update(token).digest("hex");
}
