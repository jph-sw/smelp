import type { BunRequest } from "bun";

export async function SignUpHandler(req: BunRequest) {
  return new Response("OK");
}
