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

const estimateChange = (oldValue: string | null, newValue: string | null) =>
	describeActivity(
		{ action: "issue.updated", field: "estimate", oldValue, newValue },
		[],
		[],
	);

describe("describeActivity", () => {
	test("describes setting, changing and removing the estimate", () => {
		expect(estimateChange(null, "5")).toBe("set the estimate to 5 points");
		expect(estimateChange(null, "1")).toBe("set the estimate to 1 point");
		expect(estimateChange("3", "5")).toBe(
			"changed the estimate from 3 to 5 points",
		);
		expect(estimateChange("5", null)).toBe("removed the estimate");
	});

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
