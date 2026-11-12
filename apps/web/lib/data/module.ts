import { queryOptions } from "@tanstack/react-query";
import { orpc } from "../orpc";

export const modulesQueryOptions = ({ projectId }: { projectId: string }) =>
	queryOptions({
		queryKey: ["modules", projectId],
		queryFn: () => orpc.modules.find({ projectId }),
	});

export const moduleQueryOptions = ({ id }: { id: string }) =>
	queryOptions({
		queryKey: ["module", id],
		queryFn: () => orpc.modules.get({ id }),
	});

export const createModule = (input: {
	projectId: string;
	name: string;
	description?: string;
	leadId?: string | null;
	targetDate?: string | null;
}) => orpc.modules.create(input);

export const updateModule = (input: {
	id: string;
	name?: string;
	description?: string;
	leadId?: string | null;
	targetDate?: string | null;
}) => orpc.modules.update(input);

export const deleteModule = ({ id }: { id: string }) =>
	orpc.modules.delete({ id });

// Progress changes whenever a work item or a state does, so these go together
// after any such change.
export const moduleQueryKeys = (projectId: string) => [
	["modules", projectId],
	["module"],
];
