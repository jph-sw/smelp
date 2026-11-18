const SAVE_DELAY_MS = 300;

/** One person's unsent comment on one work item, kept in this browser. */
export function commentDraftStore(userId: string | undefined, issueId: string) {
	const key = `smelp.comment-draft.${userId}.${issueId}`;
	let pending: string | null = null;
	let timer: ReturnType<typeof setTimeout> | undefined;

	const cancel = () => {
		clearTimeout(timer);
		pending = null;
	};

	const write = (markdown: string) => {
		try {
			if (markdown.trim()) localStorage.setItem(key, markdown);
			else localStorage.removeItem(key);
		} catch {}
	};

	const flush = () => {
		if (pending === null) return;
		const markdown = pending;
		cancel();
		write(markdown);
	};

	return {
		read: () => {
			try {
				return localStorage.getItem(key) ?? "";
			} catch {
				return "";
			}
		},
		save: (markdown: string) => {
			clearTimeout(timer);
			pending = markdown;
			timer = setTimeout(flush, SAVE_DELAY_MS);
		},
		flush,
		clear: () => {
			cancel();
			write("");
		},
	};
}
