import { createHash } from "node:crypto";
import { type BunFile, SQL } from "bun";
import { Logger } from "tslog";
import type { activity_logs } from "../types/tables/activity";
import type {
	auth_account,
	auth_permission,
	auth_session,
	auth_space,
	auth_space_member,
	auth_user,
} from "../types/tables/auth";
import type { schema_migrations } from "../types/tables/migration";
import type { workspace, workspace_member } from "../types/tables/workspace";

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

	toSlug(input: string): string {
		const umlautMap: Record<string, string> = {
			ä: "ae",
			ö: "oe",
			ü: "ue",
			ß: "ss",
			Ä: "Ae",
			Ö: "Oe",
			Ü: "Ue",
		};

		return input
			.replace(/[äöüßÄÖÜ]/g, (char) => umlautMap[char] ?? char)
			.normalize("NFKD")
			.replace(/[\u0300-\u036f]/g, "")
			.toLowerCase()
			.replace(/[^a-z0-9\s_-]/g, "")
			.replace(/[\s-]+/g, "_")
			.replace(/^_+|_+$/g, "");
	}
}

export type tables = {
	schema_migrations: schema_migrations;
	auth_session: auth_session;
	auth_user: auth_user;
	auth_account: auth_account;
	auth_permission: auth_permission;
	auth_space: auth_space;
	auth_space_member: auth_space_member;
	activity_logs: activity_logs;
	workspace: workspace;
	workspace_member: workspace_member;
};
