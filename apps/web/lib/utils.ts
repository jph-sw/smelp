import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function initials(name: string | null | undefined) {
	const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) return "?";

	const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
	const firstGrapheme = (word: string) =>
		segmenter.segment(word)[Symbol.iterator]().next().value?.segment ?? "";

	const first = firstGrapheme(words[0]);
	const last = words.length > 1 ? firstGrapheme(words[words.length - 1]) : "";
	return (first + last).toUpperCase();
}

export function formatDate(timestamp: number) {
	return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
		timestamp,
	);
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
	["day", 86_400_000],
	["hour", 3_600_000],
	["minute", 60_000],
];

export function formatRelativeTime(timestamp: number) {
	const elapsed = timestamp - Date.now();
	if (Math.abs(elapsed) >= 7 * 86_400_000) return formatDate(timestamp);

	const format = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
	for (const [unit, ms] of RELATIVE_UNITS) {
		if (Math.abs(elapsed) >= ms)
			return format.format(Math.trunc(elapsed / ms), unit);
	}
	return "just now";
}
