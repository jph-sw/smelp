import { createHash } from "node:crypto";
import { type BunFile, SQL } from "bun";
import { Logger } from "tslog";
import type {
	auth_account,
	auth_session,
	auth_user,
	schema_migrations,
} from "../types/tables";

export class DB {
	public sqlite = new SQL("sqlite://database.sqlite");
}

export class Utils {
	public logger;

	constructor() {
		this.logger = new Logger({
			minLevel: Bun.env.NODE_ENV === "production" ? "INFO" : "DEBUG",
		});
	}

	async checksumFile(file: Uint8Array<ArrayBuffer>): Promise<string>;
	async checksumFile(file: BunFile): Promise<string>;

	async checksumFile(file: Uint8Array<ArrayBuffer> | BunFile): Promise<string> {
		if (file instanceof Uint8Array) {
			return createHash("sha256").update(file).digest("hex");
		}
		const data = await file.bytes();
		return this.checksumFile(data);
	}
}

export type tables = {
	schema_migrations: schema_migrations;
	auth_session: auth_session;
	auth_user: auth_user;
	auth_account: auth_account;
};
