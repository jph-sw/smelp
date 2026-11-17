// Dates are whole days. Reading one as local midnight keeps it on the same day
// for everyone, where a timestamp would shift with the time zone.
function localMidnight(day: string) {
	const [year, month, date] = day.split("-").map(Number) as [
		number,
		number,
		number,
	];
	return new Date(year, month - 1, date);
}

export const formatDay = (day: string) =>
	new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
		localMidnight(day),
	);

export const formatShortDay = (day: string) =>
	new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(
		localMidnight(day),
	);
