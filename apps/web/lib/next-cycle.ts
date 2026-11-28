import type { CycleValues } from "../components/cycle/cycle-form";

type CycleDays = { name: string; startDate: string; endDate: string };

const DAY_MS = 24 * 60 * 60 * 1000;
const NAME_MAX = 64;

// Day strings are read as UTC midnight so no time zone can move them a day.
const toTime = (day: string) => {
	const [year, month, date] = day.split("-").map(Number);
	return Date.UTC(year, month - 1, date);
};
const toDay = (time: number) => new Date(time).toISOString().slice(0, 10);

const nextName = (name: string) => {
	const match = /^(.*?)(\d+)$/.exec(name);
	if (!match) return `${name.slice(0, NAME_MAX - 2)} 2`;
	const [, prefix, digits] = match;
	return `${prefix}${String(Number(digits) + 1).padStart(digits.length, "0")}`;
};

// The cycle after the latest one: same length, starting on the same weekday, so a
// Mon–Fri sprint is followed by the next Mon–Fri sprint without sharing a day.
export function nextCycle(cycles: CycleDays[]): CycleValues | null {
	const latest = cycles.reduce<CycleDays | null>(
		(found, cycle) => (!found || cycle.endDate > found.endDate ? cycle : found),
		null,
	);
	if (!latest) return null;

	const start = toTime(latest.startDate);
	const end = toTime(latest.endDate);
	const length = Math.round((end - start) / DAY_MS) + 1;
	const weekday = new Date(start).getUTCDay();
	const afterEnd = new Date(end + DAY_MS).getUTCDay();
	const nextStart = end + DAY_MS + ((weekday - afterEnd + 7) % 7) * DAY_MS;

	return {
		name: nextName(latest.name),
		startDate: toDay(nextStart),
		endDate: toDay(nextStart + (length - 1) * DAY_MS),
		goal: "",
	};
}
