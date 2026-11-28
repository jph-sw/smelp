import { ORPCError } from "@orpc/server";
import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

type Query = (
	strings: TemplateStringsArray,
	...values: unknown[]
) => PromiseLike<unknown>;

type Ranked = { id: string; rank: string };

/** Where a moved item goes: directly above or directly below another item. */
export type Placement = { before: string } | { after: string };

/** The rank that puts a new item at the bottom of the project's order. */
export async function rankAtEnd(tx: Query, projectId: string) {
	const last = (
		(await tx`SELECT max(rank) AS rank FROM issue WHERE projectId = ${projectId}`) as {
			rank: string | null;
		}[]
	)[0];
	return generateKeyBetween(last?.rank ?? null, null);
}

export function requireValidPlacement(itemId: string, placement: Placement) {
	const anchor = "before" in placement ? placement.before : placement.after;
	if (anchor === itemId) {
		throw new ORPCError("BAD_REQUEST", {
			message: "A work item can't be moved next to itself",
		});
	}
	return anchor;
}

/**
 * Writes the rank that places the item next to the anchor, and returns it. Run it
 * inside a transaction, so the neighbours it reads are still there when it writes.
 */
export async function moveRank(
	tx: Query,
	item: { id: string; projectId: string },
	placement: Placement,
) {
	const anchorId = requireValidPlacement(item.id, placement);
	const order = (await tx`
		SELECT id, rank FROM issue
		WHERE projectId = ${item.projectId} AND id != ${item.id}
		ORDER BY rank, id
	`) as Ranked[];
	const at = order.findIndex((other) => other.id === anchorId);
	if (at === -1) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Work items can only be moved next to items in the same project",
		});
	}
	const gap = "before" in placement ? at : at + 1;
	await separateTie(tx, order, gap);
	const rank = generateKeyBetween(
		order[gap - 1]?.rank ?? null,
		order[gap]?.rank ?? null,
	);
	await tx`UPDATE issue SET rank = ${rank} WHERE id = ${item.id}`;
	return rank;
}

// Items with the same rank are told apart only by id, and no key fits between two
// equal ones. Spreading that run of items over the space around it, in its current
// order, opens the gap without moving anything.
async function separateTie(tx: Query, order: Ranked[], gap: number) {
	const lower = order[gap - 1];
	const upper = order[gap];
	if (!lower || !upper || lower.rank < upper.rank) return;

	let first = gap - 1;
	while (first > 0 && order[first - 1]?.rank === lower.rank) first--;
	let end = gap + 1;
	while (end < order.length && order[end]?.rank === lower.rank) end++;

	const ranks = generateNKeysBetween(
		order[first - 1]?.rank ?? null,
		order[end]?.rank ?? null,
		end - first,
	);
	for (const [offset, rank] of ranks.entries()) {
		const tied = order[first + offset] as Ranked;
		tied.rank = rank;
		await tx`UPDATE issue SET rank = ${rank} WHERE id = ${tied.id}`;
	}
}
