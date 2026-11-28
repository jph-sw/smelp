import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { FeedEvent } from "#/lib/data/activity";
import { formatDay } from "#/lib/day";
import { issuePriorityLabel } from "#/lib/issue-priorities";
import { issueTypeLabel } from "#/lib/issue-types";
import { formatPoints } from "#/lib/points";
import { RELATION_PHRASES } from "#/lib/relations";

const linkClass =
	"font-medium text-foreground underline-offset-3 hover:underline";

function IssueRef({
	event,
	workspaceId,
}: {
	event: FeedEvent;
	workspaceId: string;
}) {
	const issue = event.issue;
	if (!issue) return <>a work item</>;
	if (!issue.exists) {
		return (
			<span className="font-medium text-foreground" title={issue.title ?? ""}>
				{issue.id}
			</span>
		);
	}
	return (
		<Link
			to="/$id/browse/$issueId"
			params={{ id: workspaceId, issueId: issue.id }}
			className={linkClass}
			title={issue.title ?? undefined}
		>
			{issue.id}
		</Link>
	);
}

function ProjectRef({
	event,
	workspaceId,
	name,
}: {
	event: FeedEvent;
	workspaceId: string;
	name?: string | null;
}) {
	const project = event.project;
	const label = name ?? project?.name ?? "a project";
	if (!project?.exists) {
		return <span className="font-medium text-foreground">{label}</span>;
	}
	return (
		<Link
			to="/$id/projects/$projectId"
			params={{ id: workspaceId, projectId: project.id }}
			className={linkClass}
		>
			{label}
		</Link>
	);
}

const Strong = ({ children }: { children: ReactNode }) => (
	<span className="font-medium text-foreground">{children}</span>
);

const withArticle = (role: string | null | undefined) =>
	!role ? "a new role" : /^[aeiou]/i.test(role) ? `an ${role}` : `a ${role}`;

const GROUP_LABELS: Record<string, string> = {
	backlog: "Backlog",
	unstarted: "Unstarted",
	started: "Started",
	completed: "Completed",
	cancelled: "Cancelled",
};

function listWords(words: string[]) {
	if (words.length <= 1) return words.join("");
	return `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

// What comes after the actor's name. Anything this doesn't know yet, like an event
// added in a later version, still reads as a sentence.
export function ActivitySentence({
	event,
	workspaceId,
}: {
	event: FeedEvent;
	workspaceId: string;
}): ReactNode {
	const d = event.details;
	const issue = <IssueRef event={event} workspaceId={workspaceId} />;
	const project = <ProjectRef event={event} workspaceId={workspaceId} />;
	const userName = <Strong>{d.userName ?? "a former member"}</Strong>;
	const isSelf = d.userId != null && d.userId === event.actorId;

	switch (event.type) {
		case "issue.created":
			return (
				<>
					created {issue}
					{event.issue?.title && ` "${event.issue.title}"`}
				</>
			);
		case "issue.status_changed":
			return (
				<>
					moved {issue} to <Strong>{d.to ?? "a deleted state"}</Strong>
				</>
			);
		case "issue.assigned":
			return d.to ? (
				<>
					assigned {issue} to <Strong>{d.to}</Strong>
				</>
			) : (
				<>unassigned {issue}</>
			);
		case "issue.updated":
			if (d.field === "parent") {
				return d.to ? (
					<>
						made {issue} a sub-item of <Strong>{d.to}</Strong>
					</>
				) : (
					<>made {issue} a top-level item</>
				);
			}
			if (d.field === "module") {
				return d.to ? (
					<>
						added {issue} to the module <Strong>{d.to}</Strong>
					</>
				) : (
					<>
						removed {issue} from the module{" "}
						<Strong>{d.from ?? "a deleted module"}</Strong>
					</>
				);
			}
			if (d.field === "cycle") {
				return d.to ? (
					<>
						added {issue} to the cycle <Strong>{d.to}</Strong>
					</>
				) : (
					<>removed {issue} from its cycle</>
				);
			}
			if (d.field === "priority") {
				return (
					<>
						changed the priority of {issue} to{" "}
						<Strong>{issuePriorityLabel(d.to)}</Strong>
					</>
				);
			}
			if (d.field === "dueDate") {
				return d.to ? (
					<>
						set the due date of {issue} to <Strong>{formatDay(d.to)}</Strong>
					</>
				) : (
					<>removed the due date of {issue}</>
				);
			}
			if (d.field === "estimate") {
				if (!d.to) return <>removed the estimate of {issue}</>;
				const points = formatPoints(Number(d.to));
				return d.from ? (
					<>
						changed the estimate of {issue} from {d.from} to{" "}
						<Strong>{points}</Strong>
					</>
				) : (
					<>
						set the estimate of {issue} to <Strong>{points}</Strong>
					</>
				);
			}
			if (d.field === "type") {
				return (
					<>
						changed the type of {issue} to{" "}
						<Strong>{issueTypeLabel(d.to)}</Strong>
					</>
				);
			}
			return d.field === "title" ? (
				<>
					renamed {issue} to {`"${d.to}"`}
				</>
			) : (
				<>edited the description of {issue}</>
			);
		case "issue.deleted":
			return (
				<>
					deleted {issue}
					{event.issue?.title && ` "${event.issue.title}"`}
				</>
			);
		case "issue.attachment_added":
			return (
				<>
					attached <Strong>{d.name ?? "a file"}</Strong> to {issue}
				</>
			);
		case "issue.attachment_removed":
			return (
				<>
					removed <Strong>{d.name ?? "a file"}</Strong> from {issue}
				</>
			);
		case "issue.relation_added":
			return (
				<>
					marked {issue} as {RELATION_PHRASES[d.relation ?? ""] ?? "related to"}{" "}
					<Strong>{d.relatedId ?? "another work item"}</Strong>
				</>
			);
		case "issue.relation_removed":
			return (
				<>
					removed the relation between {issue} and{" "}
					<Strong>{d.relatedId ?? "another work item"}</Strong>
				</>
			);
		case "issue.link_added":
			return d.name ? (
				<>
					added the link <Strong>{d.name}</Strong> to {issue}
				</>
			) : (
				<>added a link to {issue}</>
			);
		case "issue.link_updated":
			return d.name ? (
				<>
					edited the link <Strong>{d.name}</Strong> on {issue}
				</>
			) : (
				<>edited a link on {issue}</>
			);
		case "issue.link_removed":
			return d.name ? (
				<>
					removed the link <Strong>{d.name}</Strong> from {issue}
				</>
			) : (
				<>removed a link from {issue}</>
			);
		case "issue.pull_request_linked":
			return (
				<>
					linked pull request <Strong>#{d.name}</Strong> from GitHub to {issue}
				</>
			);
		case "issue.pull_request_merged":
			return (
				<>
					merged pull request <Strong>#{d.name}</Strong> for {issue} on GitHub
				</>
			);
		case "comment.created":
			return <>commented on {issue}</>;
		case "comment.updated":
			return <>edited a comment on {issue}</>;
		case "project.created":
			return d.source === "jira" ? (
				<>
					imported the project {project} from Jira
					{d.count != null && ` (${d.count} work items)`}
				</>
			) : (
				<>created the project {project}</>
			);
		case "project.archived":
			return <>archived the project {project}</>;
		case "project.unarchived":
			return <>unarchived the project {project}</>;
		case "project.updated": {
			const changes = d.changes ?? [];
			if (changes.length === 1 && changes[0] === "name") {
				return (
					<>
						renamed the project <Strong>{d.oldName}</Strong> to{" "}
						<ProjectRef event={event} workspaceId={workspaceId} name={d.name} />
					</>
				);
			}
			if (changes.length === 1 && changes[0] === "access") {
				return (
					<>
						made {project} {d.access}
					</>
				);
			}
			return (
				<>
					updated the {listWords(changes.length ? changes : ["details"])} of{" "}
					{project}
				</>
			);
		}
		case "project.deleted":
			return (
				<>
					deleted the project <Strong>{d.name ?? event.project?.name}</Strong>
				</>
			);
		case "project.member_added":
			return (
				<>
					added {userName} to {project} as {withArticle(d.role)}
				</>
			);
		case "project.member_removed":
			return isSelf ? (
				<>left {project}</>
			) : (
				<>
					removed {userName} from {project}
				</>
			);
		case "state.created":
			return (
				<>
					created the state <Strong>{d.name}</Strong> in {project}
				</>
			);
		case "state.updated": {
			const changes = d.changes ?? [];
			const name = <Strong>{d.name}</Strong>;
			if (changes.length === 1) {
				switch (changes[0]) {
					case "name":
						return (
							<>
								renamed the state <Strong>{d.oldName}</Strong> to {name} in{" "}
								{project}
							</>
						);
					case "isDefault":
						return (
							<>
								made {name} the default state in {project}
							</>
						);
					case "group":
						return (
							<>
								moved the state {name} to{" "}
								{GROUP_LABELS[d.group ?? ""] ?? d.group} in {project}
							</>
						);
					case "color":
						return (
							<>
								changed the color of {name} in {project}
							</>
						);
				}
			}
			return (
				<>
					updated the state {name} in {project}
				</>
			);
		}
		case "state.deleted":
			return (
				<>
					deleted the state <Strong>{d.name}</Strong> in {project}
					{d.movedToName && (
						<>
							, moving its work items to <Strong>{d.movedToName}</Strong>
						</>
					)}
				</>
			);
		case "state.reordered":
			return <>reordered the states in {project}</>;
		case "module.created":
			return (
				<>
					created the module <Strong>{d.name}</Strong> in {project}
				</>
			);
		case "module.updated": {
			const changes = d.changes ?? [];
			if (changes.length === 1 && changes[0] === "name") {
				return (
					<>
						renamed the module <Strong>{d.oldName}</Strong> to{" "}
						<Strong>{d.name}</Strong> in {project}
					</>
				);
			}
			return (
				<>
					updated the module <Strong>{d.name}</Strong> in {project}
				</>
			);
		}
		case "module.deleted":
			return (
				<>
					deleted the module <Strong>{d.name}</Strong> in {project}
				</>
			);
		case "workspace.created":
			return <>created the workspace</>;
		case "workspace.member_invited":
			return (
				<>
					invited {d.email ? <Strong>{d.email}</Strong> : "someone"} as{" "}
					{withArticle(d.role)}
				</>
			);
		case "workspace.member_joined":
			return isSelf ? (
				<>joined the workspace as {withArticle(d.role)}</>
			) : (
				<>added {userName} to the workspace</>
			);
		case "workspace.member_removed":
			return isSelf ? (
				<>left the workspace</>
			) : (
				<>removed {userName} from the workspace</>
			);
		case "workspace.member_role_changed":
			return (
				<>
					changed {userName}'s role from {d.from} to {d.to}
				</>
			);
		default:
			if (event.issue) return <>changed {issue}</>;
			if (event.project) return <>made a change in {project}</>;
			return <>made a change in the workspace</>;
	}
}
