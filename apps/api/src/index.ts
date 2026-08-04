import { Migrator } from "@smelp/migrate";

const migrator = new Migrator()

migrator.up()

const server = Bun.serve({
  routes: {
    "/api/status": new Response("OK"),

}})

console.log(`Server running at ${server.url}`);
