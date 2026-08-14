import { deleteCookie, getCookie } from "@orpc/server/helpers";
import { Auth } from "@smelp/auth";
import { base } from "../../orpc";

const auth = new Auth();

export const signOut = base.handler(async ({ context }) => {
	const token = getCookie(context.headers, "auth_session");

	if (token != null) {
		const [authSessionId] = token.split(".");
		if (authSessionId != null) {
			await auth.invalidateAuthSession(authSessionId);
		}
	}

	deleteCookie(context.resHeaders, "auth_session", { path: "/" });

	return { success: true };
});
