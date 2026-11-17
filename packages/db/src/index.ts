import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { type BunFile, SQL } from "bun";
import { Logger } from "tslog";
import type { activity_logs } from "../types/tables/activity";
import type { attachment } from "../types/tables/attachment";
import type {
	api_token,
	auth_account,
	auth_email_verification,
	auth_password_reset,
	auth_session,
	auth_space,
	auth_space_invite,
	auth_space_member,
	auth_user,
	auth_user_avatar,
} from "../types/tables/auth";
import type { comment } from "../types/tables/comment";
import {
	type comment_reaction,
	REACTION_EMOJIS,
} from "../types/tables/comment_reaction";
import type { cycle } from "../types/tables/cycle";
import type {
	issue_github_ref,
	project_github_repo,
} from "../types/tables/github";
import type { import_record } from "../types/tables/import_record";
import { ISSUE_TYPES, type issue } from "../types/tables/issue";
import type { issue_link } from "../types/tables/issue_link";
import type { issue_relation } from "../types/tables/issue_relation";
import type { schema_migrations } from "../types/tables/migration";
import type { module } from "../types/tables/module";
import type { notification } from "../types/tables/notification";
import type { project, project_background } from "../types/tables/project";
import type { project_counter } from "../types/tables/project_counter";
import { STATE_GROUPS, type state } from "../types/tables/state";
import type { workspace } from "../types/tables/workspace";

export function databasePath() {
	return process.env.DATABASE_PATH ?? "database.sqlite";
}

const insideTransaction = new AsyncLocalStorage<true>();

// Queries on a connection that has a transaction open become part of it, so another
// request's save could be rolled back with someone else's failure. This gives each
// transaction the connection to itself. Code inside one goes straight through, since
// waiting behind its own transaction would never finish.
function queued(connection: SQL): SQL {
	let tail: Promise<unknown> = Promise.resolve();
	const run = <T>(work: () => PromiseLike<T>): Promise<T> => {
		if (insideTransaction.getStore()) return Promise.resolve(work());
		const result = tail.then(work);
		tail = result.catch(() => {});
		return result;
	};

	// A query only starts once it's awaited, so that's the moment it joins the queue.
	const queuedQuery = (query: PromiseLike<unknown>) =>
		new Proxy(query, {
			get(target, property) {
				if (property === "then") {
					return (...handlers: Parameters<Promise<unknown>["then"]>) =>
						run(() => target).then(...handlers);
				}
				if (property === "catch" || property === "finally") {
					const settled = run(() => target);
					return settled[property].bind(settled);
				}
				const value = Reflect.get(target, property);
				return typeof value === "function" ? value.bind(target) : value;
			},
		});

	return new Proxy(connection, {
		apply(target, _this, args: unknown[]) {
			const result = Reflect.apply(target, undefined, args);
			// sql`...` is a query, while sql(row) only builds part of one.
			const isTemplate = Array.isArray(args[0]) && "raw" in args[0];
			return isTemplate ? queuedQuery(result) : result;
		},
		get(target, property) {
			const value = Reflect.get(target, property);
			if (property === "begin") {
				return (...args: unknown[]) =>
					run(() =>
						insideTransaction.run(
							true,
							() => Reflect.apply(value, target, args) as PromiseLike<unknown>,
						),
					);
			}
			return typeof value === "function" ? value.bind(target) : value;
		},
	});
}

const connections = new Map<string, SQL>();

// One connection per process. Waiting for a lock blocks this thread, so with several
// connections, a request waiting on another's open transaction would stop that
// transaction from ever finishing. The timeout is for other processes, like a backup.
function connectionTo(path: string) {
	let connection = connections.get(path);
	if (!connection) {
		const raw = new SQL(`sqlite://${path}`);
		raw`PRAGMA busy_timeout = 10000`.execute();
		raw`PRAGMA foreign_keys = ON`.execute();
		connection = queued(raw);
		connections.set(path, connection);
	}
	return connection;
}

export class DB {
	public sqlite = connectionTo(databasePath());
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
	auth_space: auth_space;
	auth_space_member: auth_space_member;
	auth_space_invite: auth_space_invite;
	auth_password_reset: auth_password_reset;
	auth_email_verification: auth_email_verification;
	auth_user_avatar: auth_user_avatar;
	api_token: api_token;
	activity_logs: activity_logs;
	workspace: workspace;
	project: project;
	project_background: project_background;
	project_counter: project_counter;
	issue: issue;
	issue_relation: issue_relation;
	state: state;
	comment: comment;
	notification: notification;
	attachment: attachment;
	comment_reaction: comment_reaction;
	issue_link: issue_link;
	issue_github_ref: issue_github_ref;
	project_github_repo: project_github_repo;
	import_record: import_record;
	module: module;
	cycle: cycle;
};

export const DEFAULTS = {
	STATE_GROUPS: STATE_GROUPS,
	REACTION_EMOJIS: REACTION_EMOJIS,
	ISSUE_TYPES: ISSUE_TYPES,
};

export type { PullRequestState } from "../types/tables/github";
export type { IssueType } from "../types/tables/issue";

export type ProjectMember = tables["auth_space_member"] &
	Pick<tables["auth_user"], "fullName" | "displayName" | "image"> & {
		/** Left out for someone reading a public project from outside it. */
		email?: string;
	};
