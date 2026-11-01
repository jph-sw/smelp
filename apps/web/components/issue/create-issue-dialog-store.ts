// this was created with the help of ai
import { useSyncExternalStore } from "react";

export type CreateIssueDialogParams = {
	workspaceId: string;
	projectId: string;
	projectName: string;
	parentId?: string;
};

type State =
	| { isOpen: false; params: null }
	| { isOpen: true; params: CreateIssueDialogParams };

let state: State = { isOpen: false, params: null };
const listeners = new Set<() => void>();

function setState(next: State) {
	state = next;
	for (const listener of listeners) listener();
}

export function openCreateIssueDialog(params: CreateIssueDialogParams) {
	setState({ isOpen: true, params });
}

export function closeCreateIssueDialog() {
	setState({ isOpen: false, params: null });
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

function getSnapshot() {
	return state;
}

export function useCreateIssueDialogStore() {
	return useSyncExternalStore(subscribe, getSnapshot);
}
