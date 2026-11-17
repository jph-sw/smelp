import { useState } from "react";

export const THEME_PREFERENCES = {
	system: "System",
	light: "Light",
	dark: "Dark",
} as const;

export type ThemePreference = keyof typeof THEME_PREFERENCES;

const STORAGE_KEY = "smelp.theme";
const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

export const isThemePreference = (value: unknown): value is ThemePreference =>
	typeof value === "string" && Object.hasOwn(THEME_PREFERENCES, value);

export const parseThemePreference = (value: unknown): ThemePreference =>
	isThemePreference(value) ? value : "system";

export const isDarkTheme = (pref: ThemePreference, systemDark: boolean) =>
	pref === "dark" || (pref === "system" && systemDark);

function readPreference(): ThemePreference {
	try {
		return parseThemePreference(localStorage.getItem(STORAGE_KEY));
	} catch {
		return "system";
	}
}

function applyTheme(pref: ThemePreference) {
	document.documentElement.classList.toggle(
		"dark",
		isDarkTheme(pref, darkQuery().matches),
	);
}

export function watchSystemTheme() {
	darkQuery().addEventListener("change", () => {
		const pref = readPreference();
		if (pref === "system") applyTheme(pref);
	});
}

/** The viewer's theme, kept in this browser. index.html applies it before first paint. */
export function useThemePreference() {
	const [pref, setPref] = useState(readPreference);
	const update = (next: ThemePreference) => {
		setPref(next);
		try {
			localStorage.setItem(STORAGE_KEY, next);
		} catch {}
		applyTheme(next);
	};
	return [pref, update] as const;
}
