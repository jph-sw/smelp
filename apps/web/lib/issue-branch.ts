const MAX_SLUG_LENGTH = 50;

function slugify(text: string) {
	return text
		.normalize("NFKD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export function issueBranchName(key: string, title: string) {
	const project = slugify(key.slice(0, key.lastIndexOf("-")));
	// The GitHub integration links a branch to every key it names, so a key in
	// the title would attach this branch to that other item too.
	const projectKeys = new RegExp(
		`(?<![a-z0-9])(?:${project}-)+\\d+(?![a-z0-9])`,
		"g",
	);
	const slug = slugify(
		slugify(title).slice(0, MAX_SLUG_LENGTH).replace(projectKeys, ""),
	);
	const prefix = key.toLowerCase();
	return slug ? `${prefix}-${slug}` : prefix;
}
