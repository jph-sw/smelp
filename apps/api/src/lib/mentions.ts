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

// Plain text for emails: "@[Ada](user:x)" reads as "@Ada".
export function plainMentions(body: string): string {
	return body.replace(MENTION, "@$1");
}
