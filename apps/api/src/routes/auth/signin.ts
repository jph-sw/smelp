import { Auth } from "@smelp/auth";
import type { BunRequest } from "bun";

export async function SignInHandler(req: BunRequest) {
  const auth = new Auth()

  let body: { email?: unknown; password?: unknown }
  try {
    body = await req.json() as typeof body
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 })
  }

  const { email, password } = body
  if (typeof email !== "string" || typeof password !== "string") {
    return Response.json({ error: "email and password are required" }, { status: 400 })
  }

  const result = await auth.signIn(email, password)

  if (result == null) {
    return Response.json({ error: "invalid credentials" }, { status: 401 })
  }

  const { session, user } = result

  return Response.json(
    { user: { id: user.id, email: user.email, name: user.name } },
    {
      headers: {
        "Set-Cookie": `auth_session=${session.authSessionToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${auth.authSessionExpiresInSeconds}`,
      },
    }
  );
}
