import { generateKeyBetween } from "fractional-indexing";

type Ranked = { id: string; rank: string };

/** Where a moved item goes: directly above or directly below another item. */
export type Placement = { before: string } | { after: string };

/** Board columns while dragging: each state's id and its cards' ids, top first. */
export type Columns = Record<string, string[]>;

export function byRank(a: Ranked, b: Ranked) {
	if (a.rank !== b.rank) return a.rank < b.rank ? -1 : 1;
	if (a.id !== b.id) return a.id < b.id ? -1 : 1;
	return 0;
}

// The server picks the final key, this one only has to sort the same way until
// its answer arrives. Two items sharing a rank leave no key between them, so the
// moved one shares it too for that moment.
export function provisionalRank(
	items: readonly Ranked[],
	id: string,
	placement: Placement,
) {
	const order = items.filter((item) => item.id !== id).sort(byRank);
	const anchor = "before" in placement ? placement.before : placement.after;
	const at = order.findIndex((item) => item.id === anchor);
	if (at === -1) return undefined;
	const gap = "before" in placement ? at : at + 1;
	const lower = order[gap - 1]?.rank ?? null;
	const upper = order[gap]?.rank ?? null;
	if (lower !== null && upper !== null && lower >= upper) return lower;
	return generateKeyBetween(lower, upper);
}

export function columnsOf(
	items: readonly (Ranked & { state: string })[],
	stateIds: readonly string[],
): Columns {
	const sorted = [...items].sort(byRank);
	return Object.fromEntries(
		stateIds.map((stateId) => [
			stateId,
			sorted.filter((item) => item.state === stateId).map((item) => item.id),
		]),
	);
}

function columnOf(columns: Columns, id: string) {
	for (const [stateId, ids] of Object.entries(columns)) {
		const index = ids.indexOf(id);
		if (index !== -1) return { stateId, ids, index };
	}
	return undefined;
}

/**
 * The columns with the dragged card moved to where it's held: onto another card
 * takes that card's place, onto a column's empty space goes to the bottom.
 */
export function moveCard(
	columns: Columns,
	cardId: string,
	targetId: string,
): Columns {
	const from = columnOf(columns, cardId);
	if (!from || targetId === cardId) return columns;

	const without = from.ids.filter((id) => id !== cardId);
	if (targetId in columns) {
		if (targetId === from.stateId) return columns;
		return {
			...columns,
			[from.stateId]: without,
			[targetId]: [...(columns[targetId] ?? []), cardId],
		};
	}

	const to = columnOf(columns, targetId);
	if (!to) return columns;
	if (to.stateId === from.stateId) {
		without.splice(to.index, 0, cardId);
		return { ...columns, [from.stateId]: without };
	}
	const into = [...to.ids];
	into.splice(to.index, 0, cardId);
	return { ...columns, [from.stateId]: without, [to.stateId]: into };
}

/** Where the card sits among its column's cards, or null when it's alone there. */
export function placementIn(columns: Columns, cardId: string) {
	const at = columnOf(columns, cardId);
	if (!at) return undefined;
	const above = at.ids[at.index - 1];
	const below = at.ids[at.index + 1];
	const placement: Placement | null = above
		? { after: above }
		: below
			? { before: below }
			: null;
	return { stateId: at.stateId, index: at.index, placement };
}
