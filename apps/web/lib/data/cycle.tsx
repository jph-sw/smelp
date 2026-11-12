import { type QueryClient, queryOptions } from "@tanstack/react-query";
import { orpc } from "../orpc";

export const cyclesQueryOptions = ({ projectId }: { projectId: string }) =>
	queryOptions({
		queryKey: ["cycles", projectId],
		queryFn: () => orpc.cycles.find({ projectId }),
	});

export const cycleQueryOptions = ({ cycleId }: { cycleId: string }) =>
	queryOptions({
		queryKey: ["cycle", cycleId],
		queryFn: () => orpc.cycles.findOne({ id: cycleId }),
	});

export const createCycle = (input: {
	projectId: string;
	name: string;
	startDate: string;
	endDate: string;
}) => orpc.cycles.create(input);

export const updateCycle = (input: {
	id: string;
	name?: string;
	startDate?: string;
	endDate?: string;
}) => orpc.cycles.update(input);

export const deleteCycle = (input: { id: string }) => orpc.cycles.delete(input);

export const moveUnfinishedToCycle = (input: {
	fromCycleId: string;
	toCycleId: string;
}) => orpc.cycles.moveUnfinished(input);

// A cycle's progress follows its items' states and membership, so anything that
// changes them has to refresh the cycles too.
export const invalidateCycles = (queryClient: QueryClient, projectId: string) =>
	Promise.all([
		queryClient.invalidateQueries({ queryKey: ["cycles", projectId] }),
		queryClient.invalidateQueries({ queryKey: ["cycle"] }),
	]);

// Dates are whole days. Reading one as local midnight keeps it on the same day
// for everyone, where a timestamp would shift with the time zone.
export function formatDay(day: string) {
	const [year, month, date] = day.split("-").map(Number) as [
		number,
		number,
		number,
	];
	return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
		new Date(year, month - 1, date),
	);
}

export const formatRange = (cycle: { startDate: string; endDate: string }) =>
	`${formatDay(cycle.startDate)} – ${formatDay(cycle.endDate)}`;
