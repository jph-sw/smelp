import { ORPCError } from "@orpc/server";
import { Utils } from "@smelp/db";

const { logger } = new Utils();

// A signed-out visitor or a duplicate name is the app working normally. Logging those
// would bury the failures someone running smelp needs to see.
export function isServerFault(error: unknown) {
	return !(error instanceof ORPCError) || error.status >= 500;
}

// Only the path: a query string or request body can hold passwords and secret links.
export function logRequestError(error: unknown, url: URL) {
	if (isServerFault(error)) {
		logger.error(`Request to ${url.pathname} failed`, error);
	}
}
