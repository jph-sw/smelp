import { queryOptions } from "@tanstack/react-query";
import { orpc } from "../orpc";

export const projectMembersQueryOptions = ({
	projectId,
}: {
	projectId: string;
}) =>
	queryOptions({
		queryKey: ["project-members", projectId],
		queryFn: async () => {
			const members = await orpc.projectMembers.find({ projectId });
			return members;
		},
	});

export const availableProjectMembersQueryOptions = ({
	projectId,
}: {
	projectId: string;
}) =>
	queryOptions({
		queryKey: ["project-members", projectId, "available"],
		queryFn: async () => {
			const members = await orpc.projectMembers.findAvailable({ projectId });
			return members;
		},
	});

export const addProjectMember = ({
	projectId,
	userId,
	role,
}: {
	projectId: string;
	userId: string;
	role: "guest" | "member" | "admin";
}) => orpc.projectMembers.add({ projectId, userId, role });

export const removeProjectMember = ({
	projectId,
	memberId,
}: {
	projectId: string;
	memberId: string;
}) => orpc.projectMembers.remove({ projectId, memberId });
