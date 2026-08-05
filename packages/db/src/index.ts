import { sql, SQL, type BunFile } from "bun";
import type { schema_migrations } from "../types/tables";
import { createHash } from 'crypto';
import { readFile } from 'fs/promises';

export class DB {
  public sqlite = new SQL("sqlite://database.sqlite");
}

export class Utils {
  async checksumFile(file: Uint8Array<ArrayBuffer>): Promise<string>;
  async checksumFile(file: BunFile): Promise<string>;

  async checksumFile(file: Uint8Array<ArrayBuffer> | BunFile): Promise<string> {
    if (file instanceof Uint8Array) {
      return createHash("sha256").update(file).digest('hex');
    }
    const data = await file.bytes();
    return this.checksumFile(data);
  }
}

export type tables = {
  schema_migrations: schema_migrations
}
