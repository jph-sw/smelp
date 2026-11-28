import { afterEach, describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { formatShortDay } from "#/lib/day";
import { cleanup, render, screen } from "#/test/dom";
import { CycleBurnup } from "./cycle-burnup";

const cycle = { id: "cycle-1", startDate: "2026-11-02", endDate: "2026-11-13" };

function renderBurnup(data: {
	unit: "points" | "items";
	days: { day: string; scope: number; completed: number }[];
}) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { enabled: false, staleTime: Infinity } },
	});
	queryClient.setQueryData(["cycle", cycle.id, "burnup"], data);
	return render(
		<QueryClientProvider client={queryClient}>
			<CycleBurnup cycle={cycle} />
		</QueryClientProvider>,
	);
}

describe("CycleBurnup", () => {
	afterEach(cleanup);

	test("summarizes the latest day and labels the unit, ticks and dates", () => {
		renderBurnup({
			unit: "points",
			days: [
				{ day: "2026-11-02", scope: 14, completed: 0 },
				{ day: "2026-11-03", scope: 15, completed: 3 },
				{ day: "2026-11-04", scope: 18, completed: 8 },
			],
		});
		expect(
			screen.getByRole("img", {
				name: `Burn-up: 8 of 18 points done on ${formatShortDay("2026-11-04")}`,
			}),
		).toBeTruthy();
		expect(screen.getByText("in points")).toBeTruthy();
		for (const tick of ["0", "5", "10", "15", "20"]) {
			expect(screen.getByText(tick)).toBeTruthy();
		}
		expect(screen.getByText(formatShortDay(cycle.startDate))).toBeTruthy();
		expect(screen.getByText(formatShortDay(cycle.endDate))).toBeTruthy();
	});

	test("keeps item counts on whole ticks", () => {
		renderBurnup({
			unit: "items",
			days: [{ day: "2026-11-02", scope: 2, completed: 1 }],
		});
		expect(screen.getByText("in items")).toBeTruthy();
		expect(screen.queryByText("0.5")).toBeNull();
		for (const tick of ["0", "1", "2"]) {
			expect(screen.getByText(tick)).toBeTruthy();
		}
	});

	test("draws nothing before the cycle has a day", () => {
		const { container } = renderBurnup({ unit: "items", days: [] });
		expect(container.innerHTML).toBe("");
	});
});
