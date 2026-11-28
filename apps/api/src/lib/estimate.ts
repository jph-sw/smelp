import * as v from "valibot";

/** Story points. Any number, not a fixed scale, so imported Jira values like 0.5 or 21 keep their meaning. */
export const Estimate = v.pipe(
	v.number(),
	v.finite("Use a number of points"),
	v.minValue(0, "An estimate can't be negative"),
	v.maxValue(1000, "Use at most 1000 points"),
);

export const pointsText = (points: number | null) =>
	points === null ? null : String(points);
