import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { currentUserQueryOptions } from "../auth";
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

// What the signed-in user can do in a project. The API enforces these rules too;
// this only decides which controls to show.
export function useProjectAccess(projectId: string) {
	const { data: user } = useSuspenseQuery(currentUserQueryOptions);
	const { data: members } = useSuspenseQuery(
		projectMembersQueryOptions({ projectId }),
	);

	const role = members.find((member) => member.userId === user?.id)?.role;
	const isInstanceAdmin = user?.role === "admin";

	return {
		user,
		members,
		canWrite: isInstanceAdmin || role === "member" || role === "admin",
		canManage: isInstanceAdmin || role === "admin",
	};
}
