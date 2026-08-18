export const STATE_GROUPS = {
	backlog: {
		label: "Backlog",
		value: "backlog",
	},
	unstared: {
		label: "Unstared",
		value: "unstared",
	},
	started: {
		label: "Started",
		value: "started",
	},
	completed: {
		label: "Completed",
		value: "completed",
	},
	cancelled: {
		label: "Cancelled",
		value: "cancelled",
	},
};

export const DEFAULT_STATES = [
	{
		name: "Backlog",
		color: "",
		group: STATE_GROUPS.backlog.value,
	},
	{
		name: "Todo",
		color: "",
		group: STATE_GROUPS.unstared.value,
	},
	{
		name: "In Progress",
		color: "",
		group: STATE_GROUPS.started.value,
	},
	{
		name: "Done",
		color: "",
		group: STATE_GROUPS.completed.value,
	},
];

export type state = {
	id: string;
	value: string;
	name: string;
	color: string;
	group: string;
	projectId: string;
	isDefault: boolean;
};
