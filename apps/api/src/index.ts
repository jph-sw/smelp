import { Auth } from "@smelp/auth";
import { Utils } from "@smelp/db";
import { Migrator } from "@smelp/migrate";

const migrator = new Migrator()
const auth = new Auth()
const utils = new Utils()

await migrator.up()

await auth.createAuthSession("test_user")

const server = Bun.serve({
  routes: {
    "/api/status": new Response("OK"),
  }
})

utils.logger.info(`𖹭 Server running at ${server.url}`)
