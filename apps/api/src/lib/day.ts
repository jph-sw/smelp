import * as v from "valibot";

/** A whole calendar day as YYYY-MM-DD. */
export const Day = v.pipe(
	v.string(),
	v.regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-01-31"),
	v.check((value) => {
		const date = new Date(`${value}T00:00:00Z`);
		return (
			!Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
		);
	}, "That date doesn't exist"),
);
