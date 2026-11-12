// Every event is saved to activity_logs and shown in the workspace feed, so a
// payload carries the names the feed needs to read well after the subject is
// renamed or deleted. Events about something inside a project carry its
// projectId, which the feed uses to decide who may see them. Payloads never
// hold secrets, tokens or long text like descriptions.
type Event<T extends string, P> = {
	type: T;
	workspaceId: string;
	actorId: string;
	entityId: string;
	payload: P;
};

type IssueRef = { projectId: string; title: string };
// Carries the link's title (never its URL, which can hold a token).
type LinkChange = IssueRef & {
	field: "link";
	oldValue: string | null;
	newValue: string | null;
};
type MemberRef = { userId: string; userName: string | null; role: string };

export type ProjectChange = "name" | "description" | "icon" | "access";
export type StateChange = "name" | "color" | "group" | "isDefault";

export type DomainEvent =
	| Event<"issue.created", IssueRef>
	| Event<
			"issue.status_changed",
			IssueRef & {
				field: "status";
				oldValue: string;
				newValue: string;
				oldName: string | null;
				newName: string | null;
			}
	  >
	| Event<
			"issue.assigned",
			IssueRef & {
				field: "assignee";
				oldValue: string | null;
				newValue: string | null;
				oldName: string | null;
				newName: string | null;
			}
	  >
	| Event<
			"issue.updated",
			IssueRef & {
				field: "title" | "description";
				oldValue: string | null;
				newValue: string | null;
			}
	  >
	| Event<"issue.deleted", IssueRef>
	| Event<"issue.link_added", LinkChange>
	| Event<"issue.link_updated", LinkChange>
	| Event<"issue.link_removed", LinkChange>
	| Event<"comment.created", IssueRef & { issueId: string }>
	| Event<"comment.updated", IssueRef & { issueId: string }>
	| Event<"auth.signin", { sessionId: string; username: string }>
	| Event<"auth.signup", { sessionId: string; username: string }>
	| Event<"workspace.created", { name: string }>
	| Event<"workspace.deleted", { name: string }>
	| Event<"project.created", { projectId: string; name: string }>
	| Event<
			"project.updated",
			{
				projectId: string;
				name: string;
				oldName: string;
				access: "public" | "private";
				changes: ProjectChange[];
			}
	  >
	| Event<
			"project.deleted",
			{
				projectId: string;
				name: string;
				access: "public" | "private";
				// Who could see the project, since it can't be checked once it's gone.
				memberIds: string[];
			}
	  >
	| Event<
			"project.archived",
			{ projectId: string; name: string; access: "public" | "private" }
	  >
	| Event<
			"project.unarchived",
			{ projectId: string; name: string; access: "public" | "private" }
	  >
	| Event<"project.member_added", MemberRef & { projectId: string }>
	| Event<"project.member_removed", MemberRef & { projectId: string }>
	| Event<
			"state.created",
			{ projectId: string; projectName: string; name: string; group: string }
	  >
	| Event<
			"state.updated",
			{
				projectId: string;
				projectName: string;
				name: string;
				oldName: string;
				group: string;
				changes: StateChange[];
			}
	  >
	| Event<
			"state.deleted",
			{
				projectId: string;
				projectName: string;
				name: string;
				movedToName: string;
			}
	  >
	| Event<"state.reordered", { projectId: string; projectName: string }>
	| Event<"workspace.member_invited", { email: string | null; role: string }>
	| Event<"workspace.member_joined", MemberRef>
	| Event<
			"workspace.member_role_changed",
			Omit<MemberRef, "role"> & {
				field: "role";
				oldValue: string;
				newValue: string;
			}
	  >
	| Event<"workspace.member_removed", MemberRef>;

export type DomainEventType = DomainEvent["type"];
