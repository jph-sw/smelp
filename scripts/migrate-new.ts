const name = process.argv[2];

if (!name) {
	console.error("usage: bun run migrate:new <name>");
	process.exit(1);
}

const slug = name
	.trim()
	.toLowerCase()
	.replace(/[^a-z0-9]+/g, "_")
	.replace(/^_+|_+$/g, "");

const filename = `${Date.now()}_${slug}.sql`;
const filepath = `./migrations/${filename}`;

await Bun.write(filepath, "");

console.log(`created ${filepath}`);
