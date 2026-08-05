import { Auth } from "@smelp/auth";
import type { BunRequest } from "bun";

export async function SignUpHandler(req: BunRequest) {
  const auth = new Auth()

  try {
    await auth.signUp("jan@example.com", "endl0s", "testpassword")
  } catch (error) { }

  return new Response("OK");
}
