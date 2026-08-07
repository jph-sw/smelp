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
				newValue: string;
			};
	  }
	| {
			type: "comment.created";
			workspaceId: string;
			actorId: string;
			entityId: string;
			payload: { issueId: string; body: string };
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
	  };

export type DomainEventType = DomainEvent["type"];
