import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Runs before anything opens the database. The tests write users and workspaces,
// so they must never reach the real database.sqlite.
const directory = mkdtempSync(path.join(tmpdir(), "smelp-test-"));
process.env.DATABASE_PATH = path.join(directory, "test.sqlite");
process.env.CORS_ORIGINS = "https://app.example.test";

// The migrator reads ./migrations relative to the repo root.
process.chdir(path.resolve(import.meta.dir, "../../.."));

const { Migrator } = await import("@smelp/migrate");
await new Migrator().up();
