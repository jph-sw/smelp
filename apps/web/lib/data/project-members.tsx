import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { orpc } from "../orpc";
import { useWorkspaceViewer } from "../workspace-viewer";
import { projectQueryOptions } from "./project";

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

// What the person on the page can do in a project. The API enforces these rules
// too; this only decides which controls to show.
export function useProjectAccess(projectId: string) {
	const viewer = useWorkspaceViewer();
	const { data: members } = useSuspenseQuery(
		projectMembersQueryOptions({ projectId }),
	);
	const { data: project } = useSuspenseQuery(
		projectQueryOptions({ projectId }),
	);

	const role =
		viewer.mode === "public"
			? undefined
			: members.find((member) => member.userId === viewer.user.id)?.role;
	const isInstanceAdmin = viewer.mode === "instanceAdmin";
	const isArchived = project.archivedAt !== null;
	const canManage = isInstanceAdmin || role === "admin";

	return {
		user: viewer.user,
		members,
		isArchived,
		// An archived project is read-only for everyone, admins included.
		canWrite:
			!isArchived && (isInstanceAdmin || role === "member" || role === "admin"),
		// Includes archive, unarchive and delete, which still work while archived.
		canManage,
		// Guests may comment too. Someone reading from outside may not.
		canComment: !isArchived && viewer.mode !== "public",
	};
}
