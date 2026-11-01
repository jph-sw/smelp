import * as v from "valibot";

export const NewPasswordSchema = v.pipe(
	v.string(),
	v.minLength(10, "Use at least 10 characters."),
	v.maxLength(64, "Use at most 64 characters."),
);

export const PASSWORDS_DIFFER = "These passwords don't match.";
