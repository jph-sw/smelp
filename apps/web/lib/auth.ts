import { ORPCError, safe } from "@orpc/client";
import type { tables } from "@smelp/db";
import { queryOptions } from "@tanstack/react-query";
import { orpc } from "./orpc";

export type AuthUser = tables["auth_user"];

export async function signIn(email: string, password: string) {
	const res = await orpc.auth.signIn({ email, password });

	return res.user;
}

export async function signUp(
	email: string,
	fullName: string,
	displayName: string,
	password: string,
) {
	const res = await orpc.auth.signUp({
		email,
		fullName,
		displayName,
		password,
	});

	return res.user;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
	const { data, error } = await safe(orpc.auth.me());

	if (error) {
		if (error instanceof ORPCError && error.code === "UNAUTHORIZED") {
			return null;
		}
		throw error;
	}

	return data.user;
}

export const currentUserQueryOptions = queryOptions({
	queryKey: ["auth", "me"],
	queryFn: getCurrentUser,
});
