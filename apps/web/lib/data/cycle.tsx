import { type QueryClient, queryOptions } from "@tanstack/react-query";
import { formatDay } from "../day";
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
	goal: string;
}) => orpc.cycles.create(input);

export const updateCycle = (input: {
	id: string;
	name?: string;
	startDate?: string;
	endDate?: string;
	goal?: string;
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

export const formatRange = (cycle: { startDate: string; endDate: string }) =>
	`${formatDay(cycle.startDate)} – ${formatDay(cycle.endDate)}`;
