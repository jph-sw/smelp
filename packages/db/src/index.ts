import { sql, SQL, type BunFile } from "bun";
import type { auth_session, schema_migrations } from "../types/tables";
import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import { Logger } from "tslog";

export class DB {
  public sqlite = new SQL("sqlite://database.sqlite");
}

export class Utils {
  public logger

  constructor() {
    this.logger = new Logger({ minLevel: "INFO" })
  }

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
  schema_migrations: schema_migrations,
  auth_session: auth_session
}
