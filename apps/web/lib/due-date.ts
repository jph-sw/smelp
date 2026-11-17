const FINISHED_GROUPS = new Set(["completed", "cancelled"]);

const pad = (n: number) => String(n).padStart(2, "0");

// The viewer's own calendar day, so "overdue" flips at their midnight, not UTC's.
export function localDay(now = new Date()) {
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function addDays(day: string, days: number) {
	const date = new Date(`${day}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

// Days as YYYY-MM-DD compare correctly as strings.
export function isOverdue(
	dueDate: string | null,
	stateGroup: string | undefined,
	today: string,
) {
	return (
		dueDate !== null &&
		dueDate < today &&
		!FINISHED_GROUPS.has(stateGroup ?? "")
	);
}

export function isDueThisWeek(
	dueDate: string | null,
	stateGroup: string | undefined,
	today: string,
) {
	return (
		dueDate !== null &&
		dueDate >= today &&
		dueDate <= addDays(today, 6) &&
		!FINISHED_GROUPS.has(stateGroup ?? "")
	);
}
