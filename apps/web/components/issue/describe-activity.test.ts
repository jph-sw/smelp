import { describe, expect, test } from "bun:test";
import { describeActivity } from "./describe-activity";

const priorityChange = (newValue: string | null) =>
	describeActivity(
		{
			action: "issue.updated",
			field: "priority",
			oldValue: "none",
			newValue,
		},
		[],
		[],
	);

describe("describeActivity", () => {
	test("names the new priority", () => {
		expect(priorityChange("high")).toBe("changed the priority to High");
		expect(priorityChange("none")).toBe("changed the priority to None");
	});

	test("falls back for a priority the web doesn't know", () => {
		expect(priorityChange("blocker")).toBe(
			"changed the priority to another priority",
		);
	});
});
