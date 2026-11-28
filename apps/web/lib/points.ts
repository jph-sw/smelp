// Sums of decimal estimates drift, like 0.1 + 0.2, so totals show two places at most.
export const roundPoints = (points: number) => Math.round(points * 100) / 100;

export function formatPoints(points: number) {
	const value = roundPoints(points);
	return `${value} ${value === 1 ? "point" : "points"}`;
}

export function formatShortPoints(points: number) {
	const value = roundPoints(points);
	return `${value} ${value === 1 ? "pt" : "pts"}`;
}
