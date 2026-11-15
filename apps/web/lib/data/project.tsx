import { queryOptions } from "@tanstack/react-query";
import { orpc } from "../orpc";

export const projectsQueryOptions = ({
	workspaceId,
}: {
	workspaceId: string;
}) =>
	queryOptions({
		queryKey: ["projects", workspaceId],
		queryFn: async () => {
			const workspaces = orpc.projects.find({ workspaceId });
			return workspaces;
		},
	});

export const projectQueryOptions = ({ projectId }: { projectId: string }) =>
	queryOptions({
		queryKey: ["project", projectId],
		queryFn: async () => {
			const project = orpc.project.find({ projectId });
			return project;
		},
	});

export const joinProject = ({ projectId }: { projectId: string }) =>
	orpc.project.join({ projectId });

export const deleteProject = ({ projectId }: { projectId: string }) =>
	orpc.project.delete({ projectId });

export const updateProject = (input: {
	projectId: string;
	name?: string;
	description?: string;
	icon?: string;
	access?: "public" | "private";
}) => orpc.project.update(input);

export const archiveProject = ({ projectId }: { projectId: string }) =>
	orpc.project.archive({ projectId });

export const unarchiveProject = ({ projectId }: { projectId: string }) =>
	orpc.project.unarchive({ projectId });

export const setProjectBackground = (input: {
	projectId: string;
	image: string;
}) => orpc.project.setBackground(input);

export const removeProjectBackground = ({ projectId }: { projectId: string }) =>
	orpc.project.removeBackground({ projectId });
