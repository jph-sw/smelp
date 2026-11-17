import { describe, expect, test } from "bun:test";
import { CsvError, parseCsv, sniffDelimiter } from "../src/lib/csv";
import { parseComment, parseJiraDate, parseJiraDay } from "../src/lib/jira-csv";

describe("parseCsv", () => {
	test("reads plain rows", () => {
		expect(parseCsv("a,b,c\n1,2,3\n")).toEqual([
			["a", "b", "c"],
			["1", "2", "3"],
		]);
	});

	test("handles quoted commas, doubled quotes and line breaks", () => {
		const text = '"a, b","say ""hi""","line one\nline two"\n';
		expect(parseCsv(text)).toEqual([
			["a, b", 'say "hi"', "line one\nline two"],
		]);
	});

	test("handles CRLF, lone CR, a BOM and a missing final newline", () => {
		expect(parseCsv("﻿a,b\r\n1,2\r3,4")).toEqual([
			["a", "b"],
			["1", "2"],
			["3", "4"],
		]);
	});

	test("keeps a CRLF inside quotes as written", () => {
		expect(parseCsv('"a\r\nb",c\r\n')).toEqual([["a\r\nb", "c"]]);
	});

	test("keeps empty fields and repeated headers by position", () => {
		expect(parseCsv("Comment,Comment,Labels\n,x,\n")).toEqual([
			["Comment", "Comment", "Labels"],
			["", "x", ""],
		]);
		expect(parseCsv('"",""\n')).toEqual([["", ""]]);
	});

	test("skips blank lines", () => {
		expect(parseCsv("a\n\n\nb\n")).toEqual([["a"], ["b"]]);
	});

	test("refuses an unterminated quote", () => {
		expect(() => parseCsv('a,"b\nc')).toThrow(CsvError);
	});

	test("stops at the row and column limits", () => {
		expect(() => parseCsv("a\nb\nc\n", { maxRows: 2 })).toThrow(CsvError);
		expect(() => parseCsv("a,b,c\n", { maxColumns: 2 })).toThrow(CsvError);
		expect(parseCsv("a\nb\n", { maxRows: 2 })).toHaveLength(2);
	});

	test("reads other delimiters", () => {
		expect(sniffDelimiter("a;b;c\n1;2;3")).toBe(";");
		expect(sniffDelimiter("﻿a,b;x,c\n")).toBe(",");
		expect(parseCsv("a;b\n1;2", { delimiter: ";" })).toEqual([
			["a", "b"],
			["1", "2"],
		]);
	});
});

describe("parseJiraDate", () => {
	const at = (iso: string) => Date.parse(iso);

	test("reads Jira's usual format, with 12 and 24 hour clocks", () => {
		expect(parseJiraDate("12/Nov/24 10:15 AM")).toBe(
			at("2024-11-12T10:15:00Z"),
		);
		expect(parseJiraDate("12/Nov/24 12:05 AM")).toBe(
			at("2024-11-12T00:05:00Z"),
		);
		expect(parseJiraDate("12/Nov/24 12:05 PM")).toBe(
			at("2024-11-12T12:05:00Z"),
		);
		expect(parseJiraDate("3/Mar/2023 4:30 PM")).toBe(
			at("2023-03-03T16:30:00Z"),
		);
		expect(parseJiraDate("12/Nov/24 22:15")).toBe(at("2024-11-12T22:15:00Z"));
		expect(parseJiraDate("12/Okt/24 08:00")).toBe(at("2024-10-12T08:00:00Z"));
	});

	test("reads ISO and dotted formats", () => {
		expect(parseJiraDate("2024-11-12 22:15")).toBe(at("2024-11-12T22:15:00Z"));
		expect(parseJiraDate("2024-11-12T22:15:00.000+0100")).toBe(
			at("2024-11-12T21:15:00Z"),
		);
		expect(parseJiraDate("12.11.2024 22:15")).toBe(at("2024-11-12T22:15:00Z"));
	});

	test("returns null for anything else", () => {
		expect(parseJiraDate("")).toBeNull();
		expect(parseJiraDate("yesterday")).toBeNull();
		expect(parseJiraDate("31/Feb/24 10:00 AM")).toBeNull();
		expect(parseJiraDate("12/Xyz/24 10:00 AM")).toBeNull();
	});
});

describe("parseJiraDay", () => {
	test("keeps only the calendar day, as written", () => {
		expect(parseJiraDay("20/Nov/26 5:00 PM")).toBe("2026-11-20");
		expect(parseJiraDay("20/Nov/26")).toBe("2026-11-20");
		expect(parseJiraDay("2026-11-20")).toBe("2026-11-20");
		expect(parseJiraDay("2026-11-20T00:30:00.000+0100")).toBe("2026-11-20");
		expect(parseJiraDay("20.11.2026")).toBe("2026-11-20");
	});

	test("returns null for an empty or unreadable value", () => {
		expect(parseJiraDay("")).toBeNull();
		expect(parseJiraDay("next week")).toBeNull();
		expect(parseJiraDay("31/Feb/26")).toBeNull();
	});
});

describe("parseComment", () => {
	test("splits on the first two semicolons only", () => {
		expect(
			parseComment("13/Nov/24 9:00 AM;acc-1;Looks good; ship it;now"),
		).toEqual({
			createdAt: Date.parse("2024-11-13T09:00:00Z"),
			author: "acc-1",
			body: "Looks good; ship it;now",
		});
	});

	test("keeps a cell that isn't in the usual shape as the body", () => {
		expect(parseComment("just words; and a semicolon")).toEqual({
			createdAt: null,
			author: "",
			body: "just words; and a semicolon",
		});
		expect(parseComment("not a date;someone;text")).toEqual({
			createdAt: null,
			author: "",
			body: "not a date;someone;text",
		});
		expect(parseComment("   ")).toBeNull();
	});
});
