import { ORPCError } from "@orpc/server";
import * as v from "valibot";
import { requireSession } from "../lib/access";
import { appUrlFromHeaders } from "../lib/app-url";
import {
	checkAuthorization,
	createAuthorizationCode,
	redirectWith,
} from "../lib/oauth";
import { base } from "../orpc";

const param = v.optional(v.pipe(v.string(), v.maxLength(2000)));

const AuthorizationInput = v.object({
	response_type: param,
	client_id: param,
	redirect_uri: param,
	code_challenge: param,
	code_challenge_method: param,
	state: param,
	resource: param,
	scope: param,
});

function destination(redirectUri: string) {
	const url = new URL(redirectUri);
	return url.protocol === "https:" || url.protocol === "http:"
		? url.host
		: `${url.protocol}//${url.host}`;
}

export const describeAuthorization = base
	.input(AuthorizationInput)
	.handler(async ({ input, context }) => {
		await requireSession(context.headers);
		const check = await checkAuthorization(
			input,
			appUrlFromHeaders(context.headers),
		);
		switch (check.kind) {
			case "invalid":
				return { kind: "invalid" as const, message: check.message };
			case "refused":
				return { kind: "redirect" as const, redirectTo: check.redirectTo };
			case "valid":
				return {
					kind: "consent" as const,
					clientName: check.client.name,
					destination: destination(check.redirectUri),
					denyUrl: redirectWith(check.redirectUri, {
						error: "access_denied",
						state: check.state,
					}),
				};
		}
	});

// Cookie only: a token can't grant itself to another app.
export const approveAuthorization = base
	.input(AuthorizationInput)
	.handler(async ({ input, context }) => {
		const session = await requireSession(context.headers);
		const check = await checkAuthorization(
			input,
			appUrlFromHeaders(context.headers),
		);
		switch (check.kind) {
			case "invalid":
				throw new ORPCError("BAD_REQUEST", { message: check.message });
			case "refused":
				return { redirectTo: check.redirectTo };
			case "valid":
				return {
					redirectTo: await createAuthorizationCode(check, session.userId),
				};
		}
	});
