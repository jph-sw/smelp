import type { tables } from "@smelp/db";
import { queryOptions } from "@tanstack/react-query";

export type AuthUser = tables["auth_user"];

async function parseAuthResponse(res: Response): Promise<AuthUser> {
	const body = await res.json();
	if (Array.isArray(body)) {
		throw new Error(body.map((issue) => issue.message).join(", "));
	}
	if (!res.ok || body.error) {
		throw new Error(body.error ?? "something went wrong");
	}
	return body.user as AuthUser;
}

export async function signIn(
	email: string,
	password: string,
): Promise<AuthUser> {
	const res = await fetch("/api/auth/signin", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email, password }),
	});
	return parseAuthResponse(res);
}

export async function signUp(
	email: string,
	fullName: string,
	displayName: string,
	password: string,
): Promise<AuthUser> {
	const res = await fetch("/api/auth/signup", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email, fullName, displayName, password }),
	});
	return parseAuthResponse(res);
}

export async function getCurrentUser(): Promise<AuthUser | null> {
	const res = await fetch("/api/auth/me");
	if (res.status === 401) {
		return null;
	}
	const body = await res.json();
	if (!res.ok || body.error) {
		throw new Error(body.error ?? "something went wrong");
	}
	return body.user as AuthUser;
}

export const currentUserQueryOptions = queryOptions({
	queryKey: ["auth", "me"],
	queryFn: getCurrentUser,
});
