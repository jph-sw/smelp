import { DB, type tables } from "@smelp/db";
import { type DomainEvent, eventBus } from "@smelp/events";
import {
	type Delivery,
	issueKeys,
	parseDelivery,
	pullRequestMilestones,
	signatureMatches,
} from "./github";
import { RateLimiter } from "./rate-limit";

const sql = new DB().sqlite;

export const MAX_DELIVERY_BYTES = 1024 * 1024;

// GitHub sends a burst for a busy push, but nothing near this.
const deliveriesByConnection = new RateLimiter(300, 60 * 1000);

const reply = (status: number, text: string) =>
	new Response(text, { status, headers: { "content-type": "text/plain" } });

// Reads at most `limit` bytes, so a chunked body with no declared size can't be
// buffered past it either.
async function readBody(request: Request, limit: number) {
	if (Number(request.headers.get("content-length") ?? 0) > limit) return null;
	const chunks: Uint8Array[] = [];
	let size = 0;
	const reader = request.body?.getReader();
	while (reader) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > limit) {
			await reader.cancel();
			return null;
		}
		chunks.push(value);
	}
	return Buffer.concat(chunks);
}

// GitHub sends JSON, or a form with the JSON in "payload" when the webhook's
// content type is left at application/x-www-form-urlencoded.
function parsePayload(request: Request, body: Uint8Array): unknown {
	const text = new TextDecoder().decode(body);
	const isForm = request.headers
		.get("content-type")
		?.startsWith("application/x-www-form-urlencoded");
	return JSON.parse(
		isForm ? (new URLSearchParams(text).get("payload") ?? "") : text,
	);
}

type LinkedIssue = Pick<
	tables["issue"],
	"id" | "workspaceId" | "projectId" | "title"
>;

// Each ref is stored once per item it names, so a redelivery or an edited pull
// request updates the row instead of adding one.
async function linkRefs(projectId: string, delivery: Delivery) {
	const keysByRef = delivery.refs.map((ref) => issueKeys(ref.text, projectId));
	const keys = [...new Set(keysByRef.flat())];
	if (keys.length === 0) return;

	const issues = (await sql`
		SELECT id, workspaceId, projectId, title FROM issue
		WHERE projectId = ${projectId} AND id IN ${sql(keys)}
	`) as LinkedIssue[];
	const issueById = new Map(issues.map((issue) => [issue.id, issue]));

	const events: DomainEvent[] = [];
	const now = Date.now();
	await sql.begin(async (tx) => {
		for (const [index, ref] of delivery.refs.entries()) {
			for (const key of keysByRef[index] ?? []) {
				const issue = issueById.get(key);
				if (!issue) continue;

				const existing = (
					await tx`
					SELECT state FROM issue_github_ref
					WHERE issueId = ${issue.id} AND repo = ${delivery.repo}
						AND kind = ${ref.kind} AND ref = ${ref.ref}
				`
				)[0] as Pick<tables["issue_github_ref"], "state"> | undefined;

				await tx`
					INSERT INTO issue_github_ref (
						id, issueId, repo, kind, ref, title, url, state, author,
						createdAt, updatedAt
					) VALUES (
						${crypto.randomUUID()}, ${issue.id}, ${delivery.repo}, ${ref.kind},
						${ref.ref}, ${ref.title}, ${ref.url}, ${ref.state}, ${ref.author},
						${now}, ${now}
					)
					ON CONFLICT (issueId, repo, kind, ref) DO UPDATE SET
						title = excluded.title,
						url = excluded.url,
						state = excluded.state,
						author = COALESCE(excluded.author, issue_github_ref.author),
						updatedAt = excluded.updatedAt
				`;

				for (const milestone of pullRequestMilestones(ref, existing?.state)) {
					events.push({
						type:
							milestone === "linked"
								? "issue.pull_request_linked"
								: "issue.pull_request_merged",
						entityId: issue.id,
						workspaceId: issue.workspaceId,
						actorId: null,
						payload: {
							projectId: issue.projectId,
							title: issue.title,
							field: "pull_request",
							oldValue: null,
							newValue: ref.ref,
							repo: delivery.repo,
							githubLogin: delivery.sender,
						},
					});
				}
			}
		}
	});
	for (const event of events) eventBus.emit(event);
}

/** POST /api/github/webhook/:connectionId, which a project's GitHub webhook calls. */
export async function githubWebhookResponse(
	request: Request,
	connectionId: string,
) {
	if (request.method !== "POST") {
		return new Response("Method not allowed", {
			status: 405,
			headers: { Allow: "POST" },
		});
	}
	if (!deliveriesByConnection.consume(connectionId).allowed) {
		return reply(429, "Too many deliveries");
	}

	const body = await readBody(request, MAX_DELIVERY_BYTES);
	if (!body) return reply(413, "Payload too large");

	const connection = (
		await sql`
		SELECT c.projectId, c.repo, c.secret, p.archivedAt
		FROM project_github_repo c JOIN project p ON p.id = c.projectId
		WHERE c.id = ${connectionId}
	`
	)[0] as
		| (Pick<tables["project_github_repo"], "projectId" | "repo" | "secret"> &
				Pick<tables["project"], "archivedAt">)
		| undefined;
	if (!connection) return reply(404, "Not found");

	const signature = request.headers.get("x-hub-signature-256");
	if (!signatureMatches(connection.secret, body, signature)) {
		return reply(401, "Signature doesn't match");
	}

	const event = request.headers.get("x-github-event") ?? "";
	if (event === "ping") return reply(200, "pong");

	let payload: unknown;
	try {
		payload = parsePayload(request, body);
	} catch {
		return reply(400, "Payload isn't JSON");
	}

	const delivery = parseDelivery(event, payload);
	if (!delivery) return reply(200, "Ignored: not an event smelp follows");
	// GitHub names are case-insensitive.
	if (delivery.repo.toLowerCase() !== connection.repo.toLowerCase()) {
		return reply(
			200,
			"Ignored: the project is connected to another repository",
		);
	}

	// An archived project is read-only, and GitHub would retry a refusal.
	if (connection.archivedAt !== null) {
		return reply(200, "Ignored: the project is archived");
	}

	await linkRefs(connection.projectId, delivery);
	return reply(200, "OK");
}
