// A mention is stored in the comment text as @[Display name](user:<id>). The id is
// what counts: the name is only for reading the raw text and may be out of date.
const MENTION = /@\[([^\]\n]{1,80})\]\(user:([a-z0-9]{8,64})\)/g;

export function mentionedUserIds(body: string): string[] {
	const ids = new Set<string>();
	for (const match of body.matchAll(MENTION)) {
		if (match[2]) ids.add(match[2]);
	}
	return [...ids];
}

// Plain text for emails. The name typed in a mention is never trusted, since anyone
// can write "@[Admin](user:<someone else>)". Ids in `names` (project members) read
// as that person's current name; any other mention is left as plain typed text.
export function plainMentions(
	body: string,
	names: ReadonlyMap<string, string>,
): string {
	return body.replace(MENTION, (_, typed: string, id: string) => {
		const name = names.get(id);
		return `@${name ?? typed}`;
	});
}
