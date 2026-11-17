import { describe, expect, test } from "bun:test";
import { isDarkTheme, parseThemePreference } from "./theme";

describe("theme", () => {
	test("an explicit choice wins over the system setting", () => {
		expect(isDarkTheme("dark", false)).toBe(true);
		expect(isDarkTheme("light", true)).toBe(false);
	});

	test("system follows the system setting", () => {
		expect(isDarkTheme("system", true)).toBe(true);
		expect(isDarkTheme("system", false)).toBe(false);
	});

	test("a missing or unknown stored value means system", () => {
		expect(parseThemePreference(null)).toBe("system");
		expect(parseThemePreference("solarized")).toBe("system");
		expect(parseThemePreference("toString")).toBe("system");
		expect(parseThemePreference("dark")).toBe("dark");
	});
});
