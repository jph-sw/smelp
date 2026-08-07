export type AuthUser = { id: string; email: string; name: string };

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

export async function signIn(email: string, password: string): Promise<AuthUser> {
	const res = await fetch("/api/auth/signin", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email, password }),
	});
	return parseAuthResponse(res);
}

export async function signUp(
	email: string,
	username: string,
	password: string,
): Promise<AuthUser> {
	const res = await fetch("/api/auth/signup", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email, username, password }),
	});
	return parseAuthResponse(res);
}
