// Every event is saved to activity_logs and shown in the workspace feed, so a
// payload carries the names the feed needs to read well after the subject is
// renamed or deleted. Events about something inside a project carry its
// projectId, which the feed uses to decide who may see them. Payloads never
// hold secrets, tokens or long text like descriptions.
type Event<T extends string, P, Actor extends string | null = string> = {
	type: T;
	workspaceId: string;
	actorId: Actor;
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
// From a GitHub webhook, so no smelp user did it. githubLogin names who did on
// GitHub; newValue is the pull request's number.
type PullRequestChange = IssueRef & {
	field: "pull_request";
	oldValue: null;
	newValue: string;
	repo: string;
	githubLogin: string | null;
};
// The ids say which cycle it was even after a rename; the names keep the log readable.
type CycleChange = IssueRef & {
	field: "cycle";
	oldValue: string | null;
	newValue: string | null;
	oldCycleId: string | null;
	newCycleId: string | null;
};
type MemberRef = { userId: string; userName: string | null; role: string };

export type ProjectChange = "name" | "description" | "icon" | "access";
export type ModuleChange = "name" | "description" | "lead" | "targetDate";
export type StateChange = "name" | "color" | "group" | "isDefault";
export type LabelChange = "name" | "color";

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
				// For "module" the values are names, kept so the log reads well after a rename or delete.
				// For "dueDate" they are days as YYYY-MM-DD.
				// For "estimate" they are story points, numbers written as strings.
				field:
					| "title"
					| "description"
					| "type"
					| "priority"
					| "parent"
					| "module"
					| "dueDate"
					| "estimate";
				oldValue: string | null;
				newValue: string | null;
			}
	  >
	| Event<"issue.updated", CycleChange>
	| Event<"issue.deleted", IssueRef>
	| Event<
			"issue.attachment_added",
			IssueRef & {
				field: "attachment";
				oldValue: null;
				newValue: string;
			}
	  >
	| Event<
			"issue.attachment_removed",
			IssueRef & {
				field: "attachment";
				oldValue: string;
				newValue: null;
			}
	  >
	| Event<
			"issue.relation_added" | "issue.relation_removed",
			IssueRef & {
				field: "relation";
				// The relation as seen from this issue, e.g. "blocks" or "blocked_by".
				oldValue: string | null;
				newValue: string | null;
				relatedId: string;
			}
	  >
	| Event<
			"issue.label_added" | "issue.label_removed",
			IssueRef & {
				field: "label";
				// The label's name, kept so the log reads well after a rename or delete.
				oldValue: string | null;
				newValue: string | null;
			}
	  >
	| Event<"issue.link_added", LinkChange>
	| Event<"issue.link_updated", LinkChange>
	| Event<"issue.link_removed", LinkChange>
	| Event<
			"issue.pull_request_linked" | "issue.pull_request_merged",
			PullRequestChange,
			null
	  >
	| Event<"comment.created", IssueRef & { issueId: string }>
	| Event<"comment.updated", IssueRef & { issueId: string }>
	| Event<"auth.signin", { sessionId: string; username: string }>
	| Event<"auth.signup", { sessionId: string; username: string }>
	| Event<"workspace.created", { name: string }>
	| Event<"workspace.deleted", { name: string }>
	| Event<
			"project.created",
			{
				projectId: string;
				name: string;
				// Set when the project was brought in from elsewhere: one event per
				// project, however many work items came with it.
				source?: "jira";
				itemCount?: number;
			}
	  >
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
	| Event<
			"module.created",
			{ projectId: string; projectName: string; name: string }
	  >
	| Event<
			"module.updated",
			{
				projectId: string;
				projectName: string;
				name: string;
				oldName: string;
				changes: ModuleChange[];
			}
	  >
	| Event<
			"module.deleted",
			{ projectId: string; projectName: string; name: string }
	  >
	| Event<
			"label.created",
			{ projectId: string; projectName: string; name: string }
	  >
	| Event<
			"label.updated",
			{
				projectId: string;
				projectName: string;
				name: string;
				oldName: string;
				changes: LabelChange[];
			}
	  >
	| Event<
			"label.deleted",
			{ projectId: string; projectName: string; name: string }
	  >
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
