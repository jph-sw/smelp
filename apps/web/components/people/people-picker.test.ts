import { describe, expect, test } from "bun:test";
import type { ProjectMember } from "@smelp/db";
import { sortMembers } from "./people-picker";

const member = (userId: string, displayName: string) =>
	({ userId, displayName }) as ProjectMember;

describe("sortMembers", () => {
	const members = [
		member("cleo", "Cleo"),
		member("me", "Zed"),
		member("ana", "Ana"),
		member("ben", "Ben"),
	];

	test("puts the current user first, then sorts by display name", () => {
		expect(sortMembers(members, "me").map((m) => m.userId)).toEqual([
			"me",
			"ana",
			"ben",
			"cleo",
		]);
	});

	test("sorts by display name when the current user is not a member", () => {
		expect(sortMembers(members, "stranger").map((m) => m.userId)).toEqual([
			"ana",
			"ben",
			"cleo",
			"me",
		]);
	});

	test("leaves the input untouched", () => {
		sortMembers(members, "me");
		expect(members[0].userId).toBe("cleo");
	});
});
