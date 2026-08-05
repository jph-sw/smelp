import { Auth } from "@smelp/auth";
import { Migrator } from "@smelp/migrate";

const migrator = new Migrator()

migrator.up()

const auth = new Auth()

// create test session
//

await auth.createAuthSession("test_user")

const server = Bun.serve({
  routes: {
    "/api/status": new Response("OK"),

  }
})

console.log(`Server running at ${server.url}`);
