import type { tables } from "@smelp/db";
import type { JiraIssue, JiraLink, ParsedJira } from "./jira-csv";

// Turns parsed Jira data plus the importer's choices into (a) the dry run shown before
// anything is saved and (b) the exact rows the import writes. Both come from this one
// function, so what the dry run promises is what gets created. Pure: callers hand in
// what they read from the database.

export const STATE_TARGETS = [
	"backlog",
	"todo",
	"in_progress",
	"done",
	"cancelled",
] as const;
export type StateTarget = (typeof STATE_TARGETS)[number];

// The states every imported project gets (the same four a new project starts with),
// plus "Cancelled" when something maps to it.
const STATES: Record<
	StateTarget,
	{ name: string; group: string; position: number }
> = {
	backlog: { name: "Backlog", group: "backlog", position: 0 },
	todo: { name: "Todo", group: "unstarted", position: 1 },
	in_progress: { name: "In Progress", group: "started", position: 2 },
	done: { name: "Done", group: "completed", position: 3 },
	cancelled: { name: "Cancelled", group: "cancelled", position: 4 },
};

export type ProjectChoice = {
	include?: boolean;
	id?: string;
	name?: string;
	access?: "public" | "private";
};

export type Mapping = {
	projects?: Record<string, ProjectChoice>;
	statuses?: Record<string, StateTarget>;
	/** Jira user key -> smelp user id, or null to leave them unmatched. */
	users?: Record<string, string | null>;
	/** Where the Jira site lives, to add a link back on each item. */
	jiraBaseUrl?: string;
};

export type Candidate = {
	id: string;
	displayName: string;
	fullName: string;
	email: string;
};

export type PlanContext = {
	importerId: string;
	workspaceId: string;
	/** Every auth_space id: a project's id is its space's id. */
	takenIds: ReadonlySet<string>;
	/** Jira keys of this workspace's projects that were imported before. */
	importedKeys: ReadonlySet<string>;
	/** Workspace members who may be given work: members and admins, not guests. */
	candidates: readonly Candidate[];
	now: number;
};

export type IdProblem = "invalid" | "taken" | "imported" | "duplicate";

export type DryRunProject = {
	jiraKey: string;
	jiraName: string;
	include: boolean;
	id: string;
	name: string;
	access: "public" | "private";
	idProblem: IdProblem | null;
	states: string[];
	workItems: number;
	subItems: number;
	comments: number;
	relations: number;
	webLinks: number;
	members: number;
};

export type DryRun = {
	projects: DryRunProject[];
	statuses: {
		name: string;
		category: string | null;
		count: number;
		target: StateTarget;
	}[];
	users: {
		key: string;
		name: string;
		assigned: number;
		comments: number;
		userId: string | null;
		matchedBy: "email" | "name" | "chosen" | null;
	}[];
	candidates: { id: string; displayName: string; email: string }[];
	totals: {
		projects: number;
		workItems: number;
		subItems: number;
		comments: number;
		relations: number;
	};
	warnings: string[];
	/** Problems that stop the import until fixed. */
	errors: string[];
};

export type ProjectWrite = {
	space: tables["auth_space"];
	members: tables["auth_space_member"][];
	project: tables["project"];
	counter: tables["project_counter"];
	states: tables["state"][];
	record: tables["import_record"];
	issues: tables["issue"][];
	comments: tables["comment"][];
	webLinks: tables["issue_link"][];
};

export type Plan = {
	dryRun: DryRun;
	projects: ProjectWrite[];
	relations: tables["issue_relation"][];
};

const ID_PATTERN = /^[A-Z][A-Z0-9]{1,4}$/;
const PROJECT_NAME_MAX = 32;
const TITLE_MAX = 120;
const DESCRIPTION_MAX = 20_000;
const COMMENT_MAX = 10_000;
const PROJECT_DESCRIPTION_MAX = 2_000;
const FOOTER_MAX = 2_000;
const TRUNCATED = "\n\n[...truncated]";

const nameKey = (name: string) =>
	name.trim().replace(/\s+/g, " ").toLowerCase();
const looksLikeEmail = (value: string) =>
	/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);

// Never cuts a character in half (emoji take two UTF-16 units).
function clip(text: string, max: number) {
	if (text.length <= max) return text;
	const code = text.charCodeAt(max - 1);
	const splitsPair = code >= 0xd800 && code <= 0xdbff;
	return text.slice(0, splitsPair ? max - 1 : max);
}

// Without a Status Category column, the status name is all there is to go on.
export function defaultTarget(
	status: string,
	category: string | null,
): StateTarget {
	const name = status.toLowerCase();
	if (/cancel|won'?t|wont|reject|declin|obsolete|invalid/.test(name)) {
		return "cancelled";
	}
	if (/backlog|icebox|parked|someday/.test(name)) return "backlog";
	const cat = category?.toLowerCase() ?? "";
	if (cat === "done" || cat === "complete" || cat === "completed")
		return "done";
	if (cat === "in progress" || cat === "indeterminate") return "in_progress";
	if (cat === "to do" || cat === "new") return "todo";
	if (/done|closed|resolved|complete|finished|released|shipped/.test(name)) {
		return "done";
	}
	if (
		/progress|review|test|develop|doing|blocked|qa|verify|started/.test(name)
	) {
		return "in_progress";
	}
	return "todo";
}

function suggestId(key: string, taken: (id: string) => boolean) {
	const base = key.toUpperCase().replace(/[^A-Z0-9]/g, "");
	const letters = base.replace(/^[0-9]+/, "") || "PRJ";
	const candidates = [letters.slice(0, 5)];
	for (let i = 1; i <= 99; i++) {
		const suffix = String(i);
		candidates.push(letters.slice(0, 5 - suffix.length) + suffix);
	}
	return (
		candidates.find((id) => ID_PATTERN.test(id) && !taken(id)) ??
		letters.slice(0, 5)
	);
}

function isValidWebUrl(value: string) {
	try {
		const { protocol } = new URL(value);
		return protocol === "http:" || protocol === "https:";
	} catch {
		return false;
	}
}

type Resolved = { key: string; name: string };

export function buildPlan(
	parsed: ParsedJira,
	mapping: Mapping,
	ctx: PlanContext,
): Plan {
	const warnings = [...parsed.warnings];
	const errors: string[] = [];
	const { issues } = parsed;

	// ---- Jira users: one identity per account id or name -------------------------
	const nameToKey = new Map<string, string>();
	const names = new Map<string, string>(parsed.userNames);
	for (const [key, name] of parsed.userNames) nameToKey.set(nameKey(name), key);
	const register = (name: string | null, id: string | null) => {
		if (name && !id && !nameToKey.has(nameKey(name))) {
			nameToKey.set(nameKey(name), name);
			names.set(name, name);
		}
	};
	for (const issue of issues) {
		register(issue.assignee, issue.assigneeId);
		register(issue.reporter, issue.reporterId);
	}
	const person = (name: string | null, id: string | null): Resolved | null => {
		if (id) return { key: id, name: names.get(id) ?? name ?? id };
		if (name) return { key: nameToKey.get(nameKey(name)) ?? name, name };
		return null;
	};
	// A comment author is an account id, or a name, depending on the export.
	const author = (raw: string): Resolved | null => {
		if (!raw) return null;
		if (names.has(raw)) return { key: raw, name: names.get(raw) ?? raw };
		const byName = nameToKey.get(nameKey(raw));
		if (byName) return { key: byName, name: names.get(byName) ?? raw };
		return { key: raw, name: raw };
	};

	// ---- Projects ---------------------------------------------------------------
	// Keys that can be used as they are are kept back, so a suggestion made for an
	// unusable key never takes one of them.
	const chosenIds = new Set<string>(
		parsed.projects
			.filter(
				(jira) =>
					!mapping.projects?.[jira.key]?.id &&
					ID_PATTERN.test(jira.key) &&
					!ctx.takenIds.has(jira.key),
			)
			.map((jira) => jira.key),
	);
	const projectPlans = parsed.projects.map((jira) => {
		const choice = mapping.projects?.[jira.key] ?? {};
		const imported = ctx.importedKeys.has(jira.key);
		const include = choice.include ?? !imported;
		const suggested = suggestId(
			jira.key,
			(id) => ctx.takenIds.has(id) || chosenIds.has(id),
		);
		const wanted = ID_PATTERN.test(jira.key) && !ctx.takenIds.has(jira.key);
		const id = (choice.id ?? (wanted ? jira.key : suggested))
			.trim()
			.toUpperCase();
		chosenIds.add(id);
		const name = clip(
			(choice.name ?? jira.name).trim() || jira.key,
			PROJECT_NAME_MAX,
		);
		return {
			jira,
			include,
			id,
			name: name.length < 2 ? `${name}${jira.key}`.slice(0, 32) : name,
			access: choice.access ?? ("private" as const),
			imported,
		};
	});

	const idCounts = new Map<string, number>();
	for (const p of projectPlans) {
		if (p.include) idCounts.set(p.id, (idCounts.get(p.id) ?? 0) + 1);
	}
	const problemOf = (p: (typeof projectPlans)[number]): IdProblem | null => {
		if (!p.include) return null;
		if (p.imported) return "imported";
		if (!ID_PATTERN.test(p.id)) return "invalid";
		if (ctx.takenIds.has(p.id)) return "taken";
		if ((idCounts.get(p.id) ?? 0) > 1) return "duplicate";
		return null;
	};
	for (const p of projectPlans) {
		if (p.include && p.name.trim().length < 2) {
			errors.push(
				`Project ${p.jira.key}: the name needs at least 2 characters.`,
			);
		}
		const problem = problemOf(p);
		if (problem === "imported") {
			errors.push(
				`Jira project ${p.jira.key} was already imported into this workspace. Leave it out, or delete the imported project first.`,
			);
		} else if (problem === "invalid") {
			errors.push(
				`Project ${p.jira.key}: "${p.id}" can't be used as an id. Use 2 to 5 letters or digits, starting with a letter.`,
			);
		} else if (problem === "taken") {
			errors.push(
				`Project ${p.jira.key}: the id ${p.id} is already in use. Choose another.`,
			);
		} else if (problem === "duplicate") {
			errors.push(`The id ${p.id} is chosen for more than one project.`);
		}
	}

	const included = new Map(
		projectPlans.filter((p) => p.include).map((p) => [p.jira.key, p]),
	);
	if (included.size === 0)
		errors.push("Select at least one project to import.");

	if (mapping.jiraBaseUrl && !isValidWebUrl(mapping.jiraBaseUrl)) {
		errors.push("The Jira address must be a valid http or https link.");
	}
	const baseUrl = mapping.jiraBaseUrl
		? (() => {
				try {
					return new URL(mapping.jiraBaseUrl).origin;
				} catch {
					return null;
				}
			})()
		: null;

	const items = issues.filter((issue) => included.has(issue.projectKey));

	// ---- Statuses ---------------------------------------------------------------
	const statusInfo = new Map<
		string,
		{ category: string | null; count: number }
	>();
	for (const issue of items) {
		const entry = statusInfo.get(issue.status) ?? {
			category: issue.statusCategory,
			count: 0,
		};
		entry.count++;
		entry.category ??= issue.statusCategory;
		statusInfo.set(issue.status, entry);
	}
	const targetOf = (status: string): StateTarget =>
		mapping.statuses?.[status] ??
		defaultTarget(status, statusInfo.get(status)?.category ?? null);

	// ---- Users ------------------------------------------------------------------
	const candidateById = new Map(ctx.candidates.map((c) => [c.id, c]));
	const byEmail = new Map(
		ctx.candidates.map((c) => [c.email.trim().toLowerCase(), c.id]),
	);
	const byName = new Map<string, string | null>();
	for (const c of ctx.candidates) {
		for (const name of new Set([c.displayName, c.fullName])) {
			const k = nameKey(name);
			if (!k) continue;
			// Two people with one name can't be told apart, so neither is matched.
			byName.set(k, byName.has(k) && byName.get(k) !== c.id ? null : c.id);
		}
	}
	const userStats = new Map<
		string,
		{ name: string; assigned: number; comments: number }
	>();
	const touch = (who: Resolved | null, field: "assigned" | "comments") => {
		if (!who) return;
		const entry = userStats.get(who.key) ?? {
			name: who.name,
			assigned: 0,
			comments: 0,
		};
		entry[field]++;
		userStats.set(who.key, entry);
	};
	for (const issue of items) {
		touch(person(issue.assignee, issue.assigneeId), "assigned");
		for (const comment of issue.comments) {
			touch(author(comment.author), "comments");
		}
		// Reporters become the creator of their items, so they can be mapped too.
		const reporter = person(issue.reporter, issue.reporterId);
		if (reporter && !userStats.has(reporter.key)) {
			userStats.set(reporter.key, {
				name: reporter.name,
				assigned: 0,
				comments: 0,
			});
		}
	}

	const matches = new Map<
		string,
		{ userId: string | null; by: "email" | "name" | "chosen" | null }
	>();
	for (const [key, info] of userStats) {
		const chosen = mapping.users?.[key];
		if (chosen !== undefined) {
			if (chosen !== null && !candidateById.has(chosen)) {
				errors.push(
					`${info.name} is mapped to someone who isn't a member of this workspace.`,
				);
				matches.set(key, { userId: null, by: null });
			} else {
				matches.set(key, {
					userId: chosen,
					by: chosen === null ? null : "chosen",
				});
			}
			continue;
		}
		const email = [key, info.name].find(looksLikeEmail);
		const emailMatch = email ? byEmail.get(email.trim().toLowerCase()) : null;
		if (emailMatch) {
			matches.set(key, { userId: emailMatch, by: "email" });
			continue;
		}
		const nameMatch = byName.get(nameKey(info.name));
		matches.set(
			key,
			nameMatch
				? { userId: nameMatch, by: "name" }
				: { userId: null, by: null },
		);
	}
	const userIdOf = (who: Resolved | null) =>
		who ? (matches.get(who.key)?.userId ?? null) : null;

	// ---- Issues -----------------------------------------------------------------
	const issueId = (issue: JiraIssue) =>
		`${included.get(issue.projectKey)?.id}-${issue.number}`;
	const byKey = new Map(items.map((issue) => [issue.key, issue]));
	const byJiraId = new Map(
		items.flatMap((issue) => (issue.id ? [[issue.id, issue] as const] : [])),
	);

	let orphanedSubTasks = 0;
	const parentOf = new Map<string, string>();
	for (const issue of items) {
		if (!issue.parentId && !issue.parentKey) continue;
		const parent =
			(issue.parentId ? byJiraId.get(issue.parentId) : undefined) ??
			(issue.parentKey ? byKey.get(issue.parentKey) : undefined);
		if (!parent || parent.projectKey !== issue.projectKey) {
			orphanedSubTasks++;
			continue;
		}
		parentOf.set(issue.key, parent.key);
	}
	// A loop in the export would leave items as each other's ancestors. Each item is
	// visited once, so a long chain of parents stays cheap.
	let loops = 0;
	const done = new Set<string>();
	for (const start of parentOf.keys()) {
		if (done.has(start)) continue;
		const path = new Set<string>();
		let at: string | undefined = start;
		let last = start;
		while (at && !done.has(at)) {
			if (path.has(at)) {
				parentOf.delete(last);
				loops++;
				break;
			}
			path.add(at);
			last = at;
			at = parentOf.get(at);
		}
		for (const key of path) done.add(key);
	}
	if (orphanedSubTasks > 0) {
		warnings.push(
			`${orphanedSubTasks} sub-task(s) have a parent that isn't in this import (or is in another project) and come across as top-level items.`,
		);
	}
	if (loops > 0) {
		warnings.push(
			`${loops} item(s) were their own ancestor in the export and come across as top-level items.`,
		);
	}

	// ---- Relations --------------------------------------------------------------
	const relations: tables["issue_relation"][] = [];
	const pairs = new Set<string>();
	const relationCountByProject = new Map<string, number>();
	let unresolvedLinks = 0;
	const otherTypes = new Set<string>();
	const unresolvedByIssue = new Map<string, JiraLink[]>();
	for (const issue of items) {
		for (const link of issue.links) {
			const other = byKey.get(link.key);
			if (!other) {
				unresolvedLinks++;
				const list = unresolvedByIssue.get(issue.key) ?? [];
				list.push(link);
				unresolvedByIssue.set(issue.key, list);
				continue;
			}
			if (other.key === issue.key) continue;
			const kind = /block/i.test(link.type)
				? "blocks"
				: /duplicat/i.test(link.type)
					? "duplicates"
					: "relates";
			if (kind === "relates" && !/^relates?( to)?$/i.test(link.type.trim())) {
				otherTypes.add(link.type);
			}
			const [source, target] =
				link.direction === "outward" || kind === "relates"
					? [issue, other]
					: [other, issue];
			const pair = [source.key, target.key].sort().join("|");
			if (pairs.has(pair)) continue;
			pairs.add(pair);
			relations.push({
				id: crypto.randomUUID(),
				sourceId: issueId(source),
				targetId: issueId(target),
				type: kind,
				createdAt: ctx.now,
				createdBy: ctx.importerId,
			});
			for (const side of new Set([source.projectKey, target.projectKey])) {
				relationCountByProject.set(
					side,
					(relationCountByProject.get(side) ?? 0) + 1,
				);
			}
		}
	}
	if (unresolvedLinks > 0) {
		warnings.push(
			`${unresolvedLinks} issue link(s) point to items that aren't part of this import. They are listed in the footer of the item instead.`,
		);
	}
	if (otherTypes.size > 0) {
		warnings.push(
			`Link types other than Blocks, Duplicate and Relates are imported as "relates": ${[...otherTypes].slice(0, 5).join(", ")}.`,
		);
	}

	// ---- Rows to write ----------------------------------------------------------
	const importerId = ctx.importerId;
	const writes: ProjectWrite[] = [];
	let datedNow = 0;
	for (const p of projectPlans) {
		if (!p.include) continue;
		const projectItems = items.filter((i) => i.projectKey === p.jira.key);

		const usedTargets = new Set<StateTarget>(
			projectItems.map((i) => targetOf(i.status)),
		);
		const targets = STATE_TARGETS.filter(
			(t) => t !== "cancelled" || usedTargets.has("cancelled"),
		);
		const states: tables["state"][] = targets.map((t) => ({
			id: crypto.randomUUID(),
			value: t,
			name: STATES[t].name,
			color: "#ffffff",
			group: STATES[t].group,
			projectId: p.id,
			isDefault: t === "backlog",
			position: STATES[t].position,
		}));
		const stateId = (t: StateTarget) =>
			states.find((s) => s.value === t)?.id as string;

		const memberIds = new Set<string>();
		const rows: tables["issue"][] = [];
		const comments: tables["comment"][] = [];
		const webLinks: tables["issue_link"][] = [];

		for (const issue of projectItems) {
			const assignee = person(issue.assignee, issue.assigneeId);
			const reporter = person(issue.reporter, issue.reporterId);
			const assigneeId = userIdOf(assignee);
			const reporterId = userIdOf(reporter);
			if (assigneeId) memberIds.add(assigneeId);
			if (reporterId) memberIds.add(reporterId);

			const created = issue.createdAt ?? ctx.now;
			if (issue.createdAt === null) datedNow++;

			const title = issue.summary.trim() || issue.key;
			const longTitle = title.length > TITLE_MAX;
			const footer = clip(
				footerOf(issue, {
					assignee: assigneeId ? null : assignee,
					reporter,
					fullTitle: longTitle ? title : null,
					unresolved: unresolvedByIssue.get(issue.key) ?? [],
				}),
				FOOTER_MAX,
			);
			const body = mentions(issue.description, names).trimEnd();
			const room = DESCRIPTION_MAX - footer.length - 2;
			const description =
				(body.length > room
					? clip(body, room - TRUNCATED.length) + TRUNCATED
					: body) +
				(body ? "\n\n" : "") +
				footer;

			const id = issueId(issue);
			rows.push({
				id,
				assignee: assigneeId,
				state: stateId(targetOf(issue.status)),
				title: longTitle ? `${clip(title, TITLE_MAX - 1)}…` : title,
				description,
				type: "task",
				parentId: parentOf.has(issue.key)
					? issueId(byKey.get(parentOf.get(issue.key) as string) as JiraIssue)
					: null,
				workspaceId: ctx.workspaceId,
				projectId: p.id,
				createdAt: created,
				updatedAt: issue.updatedAt ?? created,
				createdBy: reporterId,
				updatedBy: null,
			});

			for (const comment of issue.comments) {
				const who = author(comment.author);
				const authorId = userIdOf(who);
				if (authorId) memberIds.add(authorId);
				const text = mentions(comment.body, names).trim();
				const prefix = authorId
					? ""
					: `Comment by ${clip(who?.name ?? "an unknown Jira user", 100)} in Jira:\n\n`;
				const full = prefix + text;
				comments.push({
					id: crypto.randomUUID(),
					issueId: id,
					authorId,
					body:
						full.length > COMMENT_MAX
							? clip(full, COMMENT_MAX - TRUNCATED.length) + TRUNCATED
							: full,
					createdAt: comment.createdAt ?? created,
					editedAt: null,
				});
			}

			if (baseUrl) {
				webLinks.push({
					id: crypto.randomUUID(),
					issueId: id,
					url: `${baseUrl}/browse/${issue.key}`,
					title: `Jira ${issue.key}`,
					createdBy: importerId,
					createdAt: ctx.now,
				});
			}
		}

		const memberRows: tables["auth_space_member"][] = [
			{
				id: crypto.randomUUID(),
				spaceId: p.id,
				userId: importerId,
				role: "admin",
				createdAt: ctx.now,
			},
			...[...memberIds]
				.filter((userId) => userId !== importerId)
				.map((userId) => ({
					id: crypto.randomUUID(),
					spaceId: p.id,
					userId,
					role: "member" as const,
					createdAt: ctx.now,
				})),
		];

		writes.push({
			space: {
				id: p.id,
				name: p.name,
				ownerId: importerId,
				createdAt: ctx.now,
				updatedAt: ctx.now,
			},
			members: memberRows,
			project: {
				id: p.id,
				name: p.name,
				description: clip(p.jira.description, PROJECT_DESCRIPTION_MAX) || "",
				access: p.access,
				leadUserId: null,
				defaultAssigneeUserId: null,
				workspaceId: ctx.workspaceId,
				spaceId: p.id,
				image: null,
				icon: "AppWindowIcon",
				createdBy: importerId,
				createdAt: ctx.now,
				updatedAt: ctx.now,
				archivedAt: null,
				archivedBy: null,
			},
			counter: {
				projectId: p.id,
				lastNumber: Math.max(...projectItems.map((i) => i.number)),
			},
			states,
			record: {
				id: crypto.randomUUID(),
				workspaceId: ctx.workspaceId,
				source: "jira",
				sourceKey: p.jira.key,
				projectId: p.id,
				importedBy: importerId,
				importedAt: ctx.now,
				itemCount: rows.length,
			},
			issues: rows,
			comments,
			webLinks,
		});
	}
	if (datedNow > 0) {
		warnings.push(
			`${datedNow} work item(s) have no creation date and are dated at the time of the import.`,
		);
	}

	// ---- The dry run ------------------------------------------------------------
	const dryProjects: DryRunProject[] = projectPlans.map((p) => {
		const write = writes.find((w) => w.project.id === p.id && p.include);
		return {
			jiraKey: p.jira.key,
			jiraName: p.jira.name,
			include: p.include,
			id: p.id,
			name: p.name,
			access: p.access,
			idProblem: problemOf(p),
			states: write ? write.states.map((s) => s.name) : [],
			workItems: write?.issues.length ?? 0,
			subItems: write?.issues.filter((i) => i.parentId).length ?? 0,
			comments: write?.comments.length ?? 0,
			relations: relationCountByProject.get(p.jira.key) ?? 0,
			webLinks: write?.webLinks.length ?? 0,
			members: write ? write.members.length : 0,
		};
	});

	const dryRun: DryRun = {
		projects: dryProjects,
		statuses: [...statusInfo]
			.map(([name, info]) => ({
				name,
				category: info.category,
				count: info.count,
				target: targetOf(name),
			}))
			.sort((a, b) => b.count - a.count),
		users: [...userStats]
			.map(([key, info]) => {
				const match = matches.get(key);
				return {
					key,
					name: info.name,
					assigned: info.assigned,
					comments: info.comments,
					userId: match?.userId ?? null,
					matchedBy: match?.by ?? null,
				};
			})
			.sort((a, b) => a.name.localeCompare(b.name)),
		candidates: ctx.candidates.map((c) => ({
			id: c.id,
			displayName: c.displayName,
			email: c.email,
		})),
		totals: {
			projects: writes.length,
			workItems: writes.reduce((n, w) => n + w.issues.length, 0),
			subItems: writes.reduce(
				(n, w) => n + w.issues.filter((i) => i.parentId).length,
				0,
			),
			comments: writes.reduce((n, w) => n + w.comments.length, 0),
			relations: relations.length,
		},
		warnings,
		errors,
	};

	return { dryRun, projects: writes, relations };
}

function mentions(text: string, names: Map<string, string>) {
	// Jira writes mentions as [~accountid:abc123]. There is no way to tell who that is
	// without the export's own user list, so use its name or say so.
	return text.replace(/\[~(?:accountid:)?([^\]\s]+)\]/g, (_, id: string) =>
		names.has(id) ? `@${names.get(id)}` : "@(Jira user)",
	);
}

function footerOf(
	issue: JiraIssue,
	extra: {
		assignee: Resolved | null;
		reporter: Resolved | null;
		fullTitle: string | null;
		unresolved: JiraLink[];
	},
) {
	const lines = ["---", `Imported from Jira: ${issue.key}`];
	if (extra.fullTitle) lines.push(`Full title: ${clip(extra.fullTitle, 500)}`);
	if (issue.status) lines.push(`Jira status: ${clip(issue.status, 100)}`);
	if (issue.type) lines.push(`Jira type: ${clip(issue.type, 100)}`);
	if (issue.priority) lines.push(`Priority: ${clip(issue.priority, 100)}`);
	if (issue.resolution)
		lines.push(`Resolution: ${clip(issue.resolution, 100)}`);
	if (extra.reporter) lines.push(`Reporter: ${clip(extra.reporter.name, 100)}`);
	if (extra.assignee) {
		lines.push(`Jira assignee: ${clip(extra.assignee.name, 100)}`);
	}
	if (issue.labels.length > 0) {
		lines.push(`Labels: ${clip(issue.labels.join(", "), 300)}`);
	}
	if (issue.attachments > 0) {
		lines.push(`Attachments in Jira (not imported): ${issue.attachments}`);
	}
	for (const link of extra.unresolved.slice(0, 20)) {
		lines.push(
			`Jira link (${clip(link.type, 50)}, ${link.direction}): ${link.key}`,
		);
	}
	return lines.join("\n");
}
