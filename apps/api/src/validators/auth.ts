import { type } from "arktype";

export const Password = type("string >= 8 & string <= 64").narrow(
	(password, ctx) => {
		if (!/[a-z]/.test(password)) {
			return ctx.reject({
				expected: "a password containing a lowercase letter",
				actual: "missing one",
				message: "Password must contain a lowercase letter",
			});
		}
		if (!/[A-Z]/.test(password)) {
			return ctx.reject({
				expected: "a password containing an uppercase letter",
				actual: "missing one",
				message: "Password must contain an uppercase letter",
			});
		}
		if (!/\d/.test(password)) {
			return ctx.reject({
				expected: "a password containing a digit",
				actual: "missing one",
				message: "Password must contain a digit",
			});
		}
		if (!/[^A-Za-z0-9]/.test(password)) {
			return ctx.reject({
				expected: "a password containing a special character",
				actual: "missing one",
				message: "Password must contain a special character",
			});
		}
		return true;
	},
);

export const Email = type("string.email").pipe((s) =>
	s.trim().toLocaleLowerCase(),
);
