import type { ProjectMember, tables } from "@smelp/db";
import { issueTypeLabel } from "#/lib/issue-types";
import { RELATION_PHRASES } from "#/lib/relations";

const relatedLabel = (entry: { relatedId?: string | null }) =>
	entry.relatedId ?? "another work item";

type Activity = {
	relatedId?: string | null;
	action: string;
	field: string | null;
	oldValue: string | null;
	newValue: string | null;
};

export function describeActivity(
	entry: Activity,
	states: tables["state"][],
	members: ProjectMember[],
) {
	const stateName = (id: string | null) =>
		states.find((state) => state.id === id)?.name ?? "a deleted state";
	const memberName = (id: string | null) =>
		members.find((member) => member.userId === id)?.displayName ??
		"a former member";

	switch (entry.action) {
		case "created":
			return "created this work item";
		case "status_changed":
			return `moved this from ${stateName(entry.oldValue)} to ${stateName(entry.newValue)}`;
		case "assigned":
			return entry.newValue
				? `assigned this to ${memberName(entry.newValue)}`
				: `unassigned ${memberName(entry.oldValue)}`;
		case "issue.updated":
			if (entry.field === "parent") {
				return entry.newValue
					? `made this a sub-item of ${entry.newValue}`
					: "made this a top-level item";
			}
			if (entry.field === "module") {
				return entry.newValue
					? `added this to the module ${entry.newValue}`
					: `removed this from the module ${entry.oldValue ?? "a deleted module"}`;
			}
			if (entry.field === "type") {
				return `changed the type to ${issueTypeLabel(entry.newValue)}`;
			}
			if (entry.field === "cycle") {
				if (entry.newValue) return `added this to the cycle ${entry.newValue}`;
				return entry.oldValue
					? `removed this from the cycle ${entry.oldValue}`
					: "removed this from its cycle";
			}
			return entry.field === "title"
				? `renamed this to "${entry.newValue}"`
				: "edited the description";
		case "issue.attachment_added":
			return `attached ${entry.newValue ?? "a file"}`;
		case "issue.attachment_removed":
			return `removed ${entry.oldValue ?? "a file"}`;
		case "issue.relation_added":
			return `marked this as ${RELATION_PHRASES[entry.newValue ?? ""] ?? "related to"} ${relatedLabel(entry)}`;
		case "issue.relation_removed":
			return `removed the relation to ${relatedLabel(entry)}`;
		case "issue.link_added":
			return entry.newValue
				? `added the link "${entry.newValue}"`
				: "added a link";
		case "issue.link_updated": {
			const name = entry.newValue ?? entry.oldValue;
			return name ? `edited the link "${name}"` : "edited a link";
		}
		case "issue.link_removed":
			return entry.oldValue
				? `removed the link "${entry.oldValue}"`
				: "removed a link";
		case "issue.pull_request_linked":
			return `linked pull request #${entry.newValue} from GitHub`;
		case "issue.pull_request_merged":
			return `merged pull request #${entry.newValue} on GitHub`;
		default:
			return "changed this work item";
	}
}
