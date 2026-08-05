import { Auth } from "@smelp/auth";
import type { BunRequest } from "bun";

export async function SignInHandler(req: BunRequest) {
  const auth = new Auth()

  try {
    const session = await auth.signIn("jan@example.com", "testpassword")

    if (session != null) {
      console.log("GOT SESSION: ", session)
    }
  } catch (error) { }


  return new Response("OK");
}
