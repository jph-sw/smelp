export type DomainEvent =
	| {
			type: "issue.created";
			workspaceId: string;
			actorId: string;
			entityId: string;
			payload: { title: string; projectId: string };
	  }
	| {
			type: "issue.status_changed";
			workspaceId: string;
			actorId: string;
			entityId: string;
			payload: { field: "status"; oldValue: string; newValue: string };
	  }
	| {
			type: "issue.assigned";
			workspaceId: string;
			actorId: string;
			entityId: string;
			payload: {
				field: "assignee";
				oldValue: string | null;
				newValue: string | null;
			};
	  }
	| {
			type: "issue.updated";
			workspaceId: string;
			actorId: string;
			entityId: string;
			payload: {
				field: "title" | "description";
				oldValue: string | null;
				newValue: string | null;
			};
	  }
	| {
			type: "issue.deleted";
			workspaceId: string;
			actorId: string;
			entityId: string;
			payload: { title: string; projectId: string };
	  }
	| {
			type: "comment.created";
			workspaceId: string;
			actorId: string;
			entityId: string;
			payload: { issueId: string };
	  }
	| {
			type: "comment.updated";
			workspaceId: string;
			actorId: string;
			entityId: string;
			payload: { issueId: string };
	  }
	| {
			type: "auth.signin";
			workspaceId: string;
			actorId: string;
			entityId: string;
			payload: { sessionId: string; username: string };
	  }
	| {
			type: "auth.signup";
			workspaceId: string;
			actorId: string;
			entityId: string;
			payload: { sessionId: string; username: string };
	  }
	| {
			type: "workspace.created";
			workspaceId: string;
			actorId: string;
			entityId: string;
			payload: { name: string };
	  }
	| {
			type: "workspace.deleted";
			workspaceId: string;
			actorId: string;
			entityId: string;
			payload: { name: string };
	  }
	| {
			type: "project.created";
			workspaceId: string;
			actorId: string;
			entityId: string;
			payload: { name: string };
	  }
	| {
			type: "project.deleted";
			workspaceId: string;
			actorId: string;
			entityId: string;
			payload: { name: string };
	  }
	| {
			type: "project.archived";
			workspaceId: string;
			actorId: string;
			entityId: string;
			payload: { name: string };
	  }
	| {
			type: "project.unarchived";
			workspaceId: string;
			actorId: string;
			entityId: string;
			payload: { name: string };
	  }
	| {
			type: "workspace.member_invited";
			workspaceId: string;
			actorId: string;
			entityId: string;
			payload: { email: string | null; role: string };
	  }
	| {
			type: "workspace.member_joined";
			workspaceId: string;
			actorId: string;
			entityId: string;
			payload: { userId: string; role: string };
	  }
	| {
			type: "workspace.member_role_changed";
			workspaceId: string;
			actorId: string;
			entityId: string;
			payload: { field: "role"; oldValue: string; newValue: string };
	  }
	| {
			type: "workspace.member_removed";
			workspaceId: string;
			actorId: string;
			entityId: string;
			payload: { userId: string; role: string };
	  };

export type DomainEventType = DomainEvent["type"];
