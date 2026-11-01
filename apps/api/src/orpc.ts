import { os } from "@orpc/server";
import type { ResponseHeadersPluginContext } from "@orpc/server/plugins";

export const base = os.$context<
	{ headers: Headers; ip: string } & ResponseHeadersPluginContext
>();
