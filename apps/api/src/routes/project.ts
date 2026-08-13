import { Auth } from "@smelp/auth";
import { DB, type tables, Utils } from "@smelp/db";
import { eventBus } from "@smelp/events";
import type { BunRequest } from "bun";
import * as v from "valibot";

const sql = new DB().sqlite;
const utils = new Utils();
const auth = new Auth();
