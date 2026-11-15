import { expect, test } from "bun:test";

const root = new URL("..", import.meta.url);
const { version } = await Bun.file(new URL("package.json", root)).json();
const readme = await Bun.file(new URL("README.md", root)).text();

test("README's install, upgrade and release examples name the current version", () => {
	const stale = readme
		.split("\n")
		.map((line, index) => ({ line, number: index + 1 }))
		// The upgrade test runs from the previous release, so that line names it.
		.filter(({ line }) => !line.includes("test:upgrade"))
		.flatMap(({ line, number }) =>
			[...line.matchAll(/(?:\bv|smelp |## )(\d+\.\d+\.\d+)\b/g)]
				.filter((match) => match[1] !== version)
				.map((match) => `README.md:${number} names ${match[0]}`),
		);
	expect(stale, `bump these to ${version}`).toEqual([]);
});
