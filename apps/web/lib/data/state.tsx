import { queryOptions } from "@tanstack/react-query";
import { orpc } from "../orpc";

export const statesQueryOptions = ({ projectId }: { projectId: string }) =>
	queryOptions({
		queryKey: ["states", projectId],
		queryFn: async () => {
			const states = orpc.states.find({ projectId });
			return states;
		},
	});

export type StateGroup =
	| "backlog"
	| "unstarted"
	| "started"
	| "completed"
	| "cancelled";

export const STATE_GROUP_ITEMS: { label: string; value: StateGroup }[] = [
	{ label: "Backlog", value: "backlog" },
	{ label: "Not started", value: "unstarted" },
	{ label: "Started", value: "started" },
	{ label: "Completed", value: "completed" },
	{ label: "Cancelled", value: "cancelled" },
];

export const createState = (input: {
	projectId: string;
	name: string;
	color: string;
	group: StateGroup;
}) => orpc.state.create(input);

export const updateState = (input: {
	id: string;
	name?: string;
	color?: string;
	group?: StateGroup;
	isDefault?: true;
}) => orpc.state.update(input);

export const deleteState = (input: { id: string; moveToStateId: string }) =>
	orpc.state.delete(input);

export const reorderStates = (input: {
	projectId: string;
	stateIds: string[];
}) => orpc.state.reorder(input);
