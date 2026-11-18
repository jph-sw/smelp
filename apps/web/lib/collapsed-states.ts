import { useState } from "react";

const storageKey = (userId: string | undefined, projectId: string) =>
	`smelp.collapsed-states.${userId}.${projectId}`;

export function readCollapsedStates(
	userId: string | undefined,
	projectId: string,
): ReadonlySet<string> {
	try {
		const stored = JSON.parse(
			localStorage.getItem(storageKey(userId, projectId)) ?? "[]",
		);
		return new Set<string>(
			Array.isArray(stored)
				? stored.filter((id) => typeof id === "string")
				: [],
		);
	} catch {
		return new Set();
	}
}

export function writeCollapsedStates(
	userId: string | undefined,
	projectId: string,
	ids: ReadonlySet<string>,
) {
	try {
		localStorage.setItem(
			storageKey(userId, projectId),
			JSON.stringify([...ids]),
		);
	} catch {}
}

/** The board columns this person keeps collapsed, kept in this browser. */
export function useCollapsedStates(
	userId: string | undefined,
	projectId: string,
) {
	const key = storageKey(userId, projectId);
	const [stored, setStored] = useState(() => ({
		key,
		ids: readCollapsedStates(userId, projectId),
	}));

	// The board stays mounted between projects. Re-reading during render keeps the
	// previous project's columns from showing for a frame.
	let current = stored;
	if (stored.key !== key) {
		current = { key, ids: readCollapsedStates(userId, projectId) };
		setStored(current);
	}

	const toggle = (stateId: string) => {
		const ids = new Set(current.ids);
		if (!ids.delete(stateId)) ids.add(stateId);
		setStored({ key, ids });
		writeCollapsedStates(userId, projectId, ids);
	};

	return [current.ids, toggle] as const;
}
