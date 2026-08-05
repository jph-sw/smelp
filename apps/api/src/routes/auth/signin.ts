import type { BunRequest } from "bun";

export async function SignInHandler(req: BunRequest) {
  return new Response("OK");
}
