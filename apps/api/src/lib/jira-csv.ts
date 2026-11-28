import { CsvError, parseCsv, sniffDelimiter } from "./csv";

// Reads a Jira CSV export ("Export Excel CSV (all fields)", from Jira Cloud or Server)
// into plain data. Nothing here touches the database. Everything in the file is
// untrusted text: it is only ever stored as text.

export const LIMITS = {
	/** Characters in the uploaded file. */
	fileChars: 10 * 1024 * 1024,
	/** Data rows, so one upload can't hold the database lock for minutes. */
	rows: 20_000,
	columns: 1_000,
	projects: 50,
} as const;

export class JiraCsvError extends Error {}

export type JiraUser = {
	/** The account id when the export has one, else the name. */
	key: string;
	name: string;
};

export type JiraComment = {
	createdAt: number | null;
	/** The author as written in the cell: an account id or a name. */
	author: string;
	body: string;
};

export type JiraLink = {
	/** The link type's name, e.g. "Blocks" or "Relates". */
	type: string;
	direction: "outward" | "inward";
	/** The other item's key. */
	key: string;
};

export type JiraIssue = {
	key: string;
	number: number;
	projectKey: string;
	id: string | null;
	summary: string;
	type: string;
	status: string;
	statusCategory: string | null;
	priority: string | null;
	resolution: string | null;
	description: string;
	createdAt: number | null;
	updatedAt: number | null;
	/** YYYY-MM-DD. */
	dueDate: string | null;
	/** Story points. */
	estimate: number | null;
	assignee: string | null;
	assigneeId: string | null;
	reporter: string | null;
	reporterId: string | null;
	labels: string[];
	parentId: string | null;
	parentKey: string | null;
	comments: JiraComment[];
	links: JiraLink[];
	attachments: number;
	/** The line in the file (the header is line 1), for messages. */
	line: number;
};

export type JiraProject = {
	key: string;
	name: string;
	description: string;
};

export type ParsedJira = {
	projects: JiraProject[];
	issues: JiraIssue[];
	/** Account id -> display name, from the assignee/reporter columns. */
	userNames: Map<string, string>;
	warnings: string[];
};

const MONTHS: Record<string, number> = {
	jan: 0,
	feb: 1,
	mar: 2,
	apr: 3,
	may: 4,
	mai: 4,
	jun: 5,
	jul: 6,
	aug: 7,
	sep: 8,
	sept: 8,
	oct: 9,
	okt: 9,
	nov: 10,
	dec: 11,
	dez: 11,
	mär: 2,
	mrz: 2,
};

/**
 * Jira's export formats: "12/Nov/24 10:15 AM" (the usual one), "12/Nov/24 22:15",
 * "12/Nov/24" for date-only fields like the due date,
 * ISO "2024-11-12 22:15" or "2024-11-12T22:15:00.000+0100", and "12.11.2024 22:15".
 * The file carries no time zone, so times without an offset are read as UTC.
 */
export function parseJiraDate(value: string): number | null {
	const text = value.trim();
	if (!text) return null;

	const named = text.match(
		/^(\d{1,2})\/([\p{L}]{3,4})\/(\d{2}|\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?)?$/u,
	);
	if (named) {
		const [, day, monthName, year, hour, minute, second, meridiem] = named;
		const month = MONTHS[(monthName as string).toLowerCase()];
		if (month === undefined) return null;
		return utc(
			expandYear(year as string),
			month,
			Number(day),
			to24Hour(Number(hour ?? 0), meridiem),
			Number(minute ?? 0),
			Number(second ?? 0),
		);
	}

	const dotted = text.match(
		/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
	);
	if (dotted) {
		const [, day, month, year, hour, minute, second] = dotted;
		return utc(
			Number(year),
			Number(month) - 1,
			Number(day),
			Number(hour ?? 0),
			Number(minute ?? 0),
			Number(second ?? 0),
		);
	}

	const iso = text.match(
		/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?)?$/,
	);
	if (iso) {
		const [, year, month, day, hour, minute, second, zone] = iso;
		const base = utc(
			Number(year),
			Number(month) - 1,
			Number(day),
			Number(hour ?? 0),
			Number(minute ?? 0),
			Number(second ?? 0),
		);
		if (base === null || !zone || zone === "Z") return base;
		const sign = zone.startsWith("-") ? -1 : 1;
		const digits = zone.slice(1).replace(":", "");
		const offset = Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4));
		return base - sign * offset * 60_000;
	}
	return null;
}

// A due date is a calendar day, so the time and any offset Jira writes are dropped.
export function parseJiraDay(value: string): string | null {
	const time = parseJiraDate(value);
	if (time === null) return null;
	const iso = value.trim().match(/^\d{4}-\d{2}-\d{2}/);
	return iso ? iso[0] : new Date(time).toISOString().slice(0, 10);
}

function expandYear(year: string) {
	if (year.length === 4) return Number(year);
	const short = Number(year);
	return short >= 70 ? 1900 + short : 2000 + short;
}

function to24Hour(hour: number, meridiem: string | undefined) {
	if (!meridiem) return hour;
	const pm = meridiem.toLowerCase() === "pm";
	return (hour % 12) + (pm ? 12 : 0);
}

function utc(
	year: number,
	month: number,
	day: number,
	hour: number,
	minute: number,
	second: number,
) {
	if (hour > 23 || minute > 59 || second > 59) return null;
	const date = new Date(Date.UTC(year, month, day, hour, minute, second));
	// Rolling over (31 Feb) means the date was not real.
	if (date.getUTCMonth() !== month || date.getUTCDate() !== day) return null;
	return date.getTime();
}

/**
 * Comments are one cell each: "date;author;body". The body can hold semicolons, so only
 * the first two split. A cell that doesn't look like that is kept whole, author unknown.
 */
export function parseComment(cell: string): JiraComment | null {
	if (!cell.trim()) return null;
	const first = cell.indexOf(";");
	const second = first === -1 ? -1 : cell.indexOf(";", first + 1);
	if (first === -1 || second === -1) {
		return { createdAt: null, author: "", body: cell };
	}
	const createdAt = parseJiraDate(cell.slice(0, first));
	if (createdAt === null && cell.slice(0, first).trim() !== "") {
		return { createdAt: null, author: "", body: cell };
	}
	return {
		createdAt,
		author: cell
			.slice(first + 1, second)
			.trim()
			.slice(0, 255),
		body: cell.slice(second + 1),
	};
}

const norm = (header: string) => header.trim().toLowerCase();

type Columns = {
	/** First column with this name (case-insensitive), or -1. */
	one: (name: string) => number;
	/** Every column with this name, in file order. */
	all: (name: string) => number[];
	headers: string[];
};

function columnsOf(header: string[]): Columns {
	const names = header.map(norm);
	return {
		headers: header,
		one: (name) => names.indexOf(name),
		all: (name) =>
			names.flatMap((candidate, index) => (candidate === name ? [index] : [])),
	};
}

// Company-managed projects export "Story Points", team-managed ones "Story point
// estimate", and a file mixing both kinds of project has both columns.
const STORY_POINT_COLUMNS = [
	"story points",
	"custom field (story points)",
	"custom field (story point estimate)",
];

function parseStoryPoints(value: string): number | null {
	const match = value.trim().match(/^\d+(?:[.,]\d+)?$/);
	if (!match) return null;
	const points = Number(match[0].replace(",", "."));
	return points <= 1000 ? points : null;
}

const ISSUE_KEY = /^([A-Za-z][A-Za-z0-9_]{0,99})-(\d{1,9})$/;

export function parseJiraCsv(text: string): ParsedJira {
	if (text.length > LIMITS.fileChars) {
		throw new JiraCsvError(
			`That file is too large. The limit is ${LIMITS.fileChars / 1024 / 1024} MB.`,
		);
	}

	let rows: string[][];
	try {
		rows = parseCsv(text, {
			delimiter: sniffDelimiter(text),
			// The header row counts too.
			maxRows: LIMITS.rows + 1,
			maxColumns: LIMITS.columns,
		});
	} catch (error) {
		if (error instanceof CsvError) {
			throw new JiraCsvError(
				error.message.includes("rows")
					? `That file has more than ${LIMITS.rows} work items. Split the export by project or date and import the parts one by one.`
					: error.message,
			);
		}
		throw error;
	}

	const [header, ...data] = rows;
	if (!header) throw new JiraCsvError("That file is empty.");
	const columns = columnsOf(header);

	const summary = columns.one("summary");
	const issueKey = columns.one("issue key");
	const status = columns.one("status");
	const missing = [
		summary < 0 && "Summary",
		issueKey < 0 && "Issue key",
		status < 0 && "Status",
	].filter(Boolean);
	if (missing.length > 0) {
		throw new JiraCsvError(
			`This doesn't look like a Jira export: the column ${missing.join(", ")} is missing. Export with "Export Excel CSV (all fields)" and include every column.`,
		);
	}
	if (data.length === 0) {
		throw new JiraCsvError("That file has a header but no work items.");
	}

	const col = {
		issueId: columns.one("issue id"),
		type: columns.one("issue type"),
		category: columns.one("status category"),
		projectKey: columns.one("project key"),
		projectName: columns.one("project name"),
		projectDescription: columns.one("project description"),
		priority: columns.one("priority"),
		resolution: columns.one("resolution"),
		assignee: columns.one("assignee"),
		assigneeId: columns.one("assignee id"),
		reporter: columns.one("reporter"),
		reporterId: columns.one("reporter id"),
		created: columns.one("created"),
		updated: columns.one("updated"),
		dueDate: columns.one("due date"),
		estimate: STORY_POINT_COLUMNS.flatMap(columns.all),
		description: columns.one("description"),
		parentId: columns.one("parent id"),
		parent: columns.one("parent"),
		labels: columns.all("labels"),
		comments: columns.all("comment"),
		attachments: columns.all("attachment"),
	};
	// "Outward issue link (Blocks)" and "Inward issue link (Blocks)", one column per
	// occurrence, with the other item's key in the cell.
	const linkColumns = columns.headers.flatMap((name, index) => {
		const match = name.trim().match(/^(outward|inward) issue link \((.+)\)$/i);
		return match
			? [
					{
						index,
						direction: (match[1] as string).toLowerCase() as
							| "outward"
							| "inward",
						type: (match[2] as string).trim(),
					},
				]
			: [];
	});

	// Cells that become names, keys and mapping entries are capped, so nothing in the
	// file can grow a mapping key past what the API accepts.
	const cell = (row: string[], index: number, max = 255) =>
		index < 0 ? "" : (row[index] ?? "").trim().slice(0, max);

	const warnings: string[] = [];
	const projects = new Map<string, JiraProject>();
	const issues: JiraIssue[] = [];
	const userNames = new Map<string, string>();
	const seenKeys = new Set<string>();
	// Items moved between projects keep their old key, so two keys can end up as the
	// same number in the same project.
	const seenNumbers = new Set<string>();
	let badRows = 0;
	let duplicateRows = 0;
	let badDates = 0;

	data.forEach((row, offset) => {
		const line = offset + 2;
		const key = cell(row, issueKey);
		const match = key.match(ISSUE_KEY);
		if (!match) {
			badRows++;
			return;
		}
		const number = Number(match[2]);
		const projectKey = (
			cell(row, col.projectKey, 100) || (match[1] as string)
		).toUpperCase();
		if (!Number.isSafeInteger(number) || number < 1) {
			badRows++;
			return;
		}
		const normalizedKey = `${(match[1] as string).toUpperCase()}-${number}`;
		if (seenKeys.has(normalizedKey)) {
			duplicateRows++;
			return;
		}
		const numberKey = `${projectKey}-${number}`;
		if (seenNumbers.has(numberKey)) {
			duplicateRows++;
			return;
		}
		seenKeys.add(normalizedKey);
		seenNumbers.add(numberKey);

		if (!projects.has(projectKey)) {
			if (projects.size >= LIMITS.projects) {
				throw new JiraCsvError(
					`That file has more than ${LIMITS.projects} projects. Export fewer projects at a time.`,
				);
			}
			projects.set(projectKey, {
				key: projectKey,
				name: cell(row, col.projectName) || projectKey,
				description: cell(row, col.projectDescription, 2000),
			});
		}

		const date = (index: number) => {
			const value = cell(row, index);
			if (!value) return null;
			const parsed = parseJiraDate(value);
			if (parsed === null) badDates++;
			return parsed;
		};

		const assignee = cell(row, col.assignee) || null;
		const assigneeId = cell(row, col.assigneeId) || null;
		const reporter = cell(row, col.reporter) || null;
		const reporterId = cell(row, col.reporterId) || null;
		if (assigneeId && assignee) userNames.set(assigneeId, assignee);
		if (reporterId && reporter) userNames.set(reporterId, reporter);

		const comments: JiraComment[] = [];
		for (const index of col.comments) {
			const comment = parseComment(row[index] ?? "");
			if (comment?.body.trim()) comments.push(comment);
		}

		const links: JiraLink[] = [];
		for (const { index, direction, type } of linkColumns) {
			const target = cell(row, index).match(ISSUE_KEY);
			if (!target) continue;
			links.push({
				type,
				direction,
				key: `${(target[1] as string).toUpperCase()}-${Number(target[2])}`,
			});
		}

		const parentKey = cell(row, col.parent).match(ISSUE_KEY);
		issues.push({
			key: normalizedKey,
			number,
			projectKey,
			id: cell(row, col.issueId) || null,
			summary: cell(row, summary, 1000),
			type: cell(row, col.type),
			status: cell(row, status),
			statusCategory: cell(row, col.category) || null,
			priority: cell(row, col.priority) || null,
			resolution: cell(row, col.resolution) || null,
			// Only the description keeps its own line breaks and spacing.
			description: col.description < 0 ? "" : (row[col.description] ?? ""),
			createdAt: date(col.created),
			updatedAt: date(col.updated),
			dueDate: parseJiraDay(cell(row, col.dueDate)),
			estimate:
				col.estimate
					.map((index) => parseStoryPoints(cell(row, index)))
					.find((points) => points !== null) ?? null,
			assignee,
			assigneeId,
			reporter,
			reporterId,
			labels: col.labels
				.flatMap((index) => cell(row, index).split(/\s+/))
				.filter(Boolean),
			parentId: cell(row, col.parentId) || null,
			parentKey: parentKey
				? `${(parentKey[1] as string).toUpperCase()}-${Number(parentKey[2])}`
				: null,
			comments,
			links,
			attachments: col.attachments.filter((index) => cell(row, index)).length,
			line,
		});
	});

	if (issues.length === 0) {
		throw new JiraCsvError(
			"No work items found. The Issue key column should hold keys like ABC-123.",
		);
	}
	if (badRows > 0) {
		warnings.push(
			`${badRows} row(s) have no valid issue key (like ABC-123) and were skipped.`,
		);
	}
	if (duplicateRows > 0) {
		warnings.push(
			`${duplicateRows} row(s) repeat an issue key that appears earlier and were skipped.`,
		);
	}
	if (badDates > 0) {
		warnings.push(
			`${badDates} date(s) were in a format that isn't recognised. Those items and comments are dated at the time of the import.`,
		);
	}
	const attachments = issues.reduce((sum, issue) => sum + issue.attachments, 0);
	if (attachments > 0) {
		warnings.push(
			`${attachments} attachment(s) are not imported. Jira exports only link to them. Each item's footer says how many it had.`,
		);
	}

	return { projects: [...projects.values()], issues, userNames, warnings };
}
