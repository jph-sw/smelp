import { Auth } from "@smelp/auth";
import { Utils } from "@smelp/db";
import { Migrator } from "@smelp/migrate";

const migrator = new Migrator()
const auth = new Auth()
const utils = new Utils()

migrator.up()

await auth.createAuthSession("test_user")

const server = Bun.serve({
  routes: {
    "/api/status": new Response("OK"),
  }
})

utils.logger.info(`Server running at ${server.url}`)
