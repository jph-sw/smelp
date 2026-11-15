import { beforeAll, describe, expect, test } from "bun:test";
import { createRouterClient } from "@orpc/server";

// Imported dynamically so setup.ts points the database at a temp file first.
await import("./setup");
const { Auth } = await import("@smelp/auth");
const { DB } = await import("@smelp/db");
const { router } = await import("../src/router");
const { MAX_BACKGROUND_BYTES, projectBackgroundResponse } = await import(
	"../src/lib/project-backgrounds"
);

const sql = new DB().sqlite;
const auth = new Auth();

const WORKSPACE = "background_tests";
const PROJECT = "BGT";

const expectCode = (call: Promise<unknown>, code: string) =>
	expect(call).rejects.toMatchObject({ code });

let userCount = 0;
async function createUser(name: string) {
	userCount += 1;
	const { session, user } = await auth.signUp(
		`bg-${name}-${userCount}@example.test`,
		name,
		`bg-${name}-${userCount}`,
		"correct-horse-battery",
	);
	const headers = new Headers({
		cookie: `auth_session=${session.authSessionToken}`,
	});
	return {
		id: user.id,
		headers,
		client: createRouterClient(router, {
			context: { headers, ip: "198.51.100.21" },
		}),
	};
}

async function addMember(spaceId: string, userId: string, role: string) {
	await sql`INSERT INTO auth_space_member ${sql({
		id: crypto.randomUUID(),
		spaceId,
		userId,
		role,
		createdAt: Date.now(),
	})}`;
}

const png = Buffer.from([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 0, 255,
]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9, 9]);
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

let admin: Awaited<ReturnType<typeof createUser>>;
let member: Awaited<ReturnType<typeof createUser>>;
let outsider: Awaited<ReturnType<typeof createUser>>;

beforeAll(async () => {
	admin = await createUser("admin");
	member = await createUser("member");
	outsider = await createUser("outsider");

	await admin.client.workspace.create({ name: "Background tests" });
	await admin.client.project.create({
		id: PROJECT,
		name: "Backgrounds",
		description: "",
		access: "private",
		icon: "AppWindowIcon",
		workspaceId: WORKSPACE,
	});
	await addMember(WORKSPACE, member.id, "member");
	await addMember(WORKSPACE, outsider.id, "member");
	await addMember(PROJECT, member.id, "member");
});

describe("board backgrounds", () => {
	test("an admin's upload is served to project members", async () => {
		const project = await admin.client.project.setBackground({
			projectId: PROJECT,
			image: b64(png),
		});
		expect(project.backgroundImage).toMatch(
			new RegExp(`^/api/project-backgrounds/${PROJECT}\\?v=\\d+$`),
		);
		const found = await member.client.project.find({ projectId: PROJECT });
		expect(found.backgroundImage).toBe(project.backgroundImage);

		const res = await projectBackgroundResponse(member.headers, PROJECT);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("image/png");
		expect(res.headers.get("x-content-type-options")).toBe("nosniff");
		expect(Buffer.from(await res.arrayBuffer()).equals(png)).toBe(true);
	});

	test("replacing it changes its address and the bytes served", async () => {
		const first = await admin.client.project.setBackground({
			projectId: PROJECT,
			image: b64(png),
		});
		await Bun.sleep(2);
		const second = await admin.client.project.setBackground({
			projectId: PROJECT,
			image: b64(jpeg),
		});
		expect(second.backgroundImage).not.toBe(first.backgroundImage);
		const res = await projectBackgroundResponse(admin.headers, PROJECT);
		expect(res.headers.get("content-type")).toBe("image/jpeg");
		expect(Buffer.from(await res.arrayBuffer()).equals(jpeg)).toBe(true);
	});

	test("isn't served to anyone outside a private project", async () => {
		await admin.client.project.setBackground({
			projectId: PROJECT,
			image: b64(png),
		});
		expect(
			(await projectBackgroundResponse(outsider.headers, PROJECT)).status,
		).toBe(403);
		expect(
			(await projectBackgroundResponse(new Headers(), PROJECT)).status,
		).toBe(401);
		expect(
			(await projectBackgroundResponse(admin.headers, "NOPE")).status,
		).toBe(404);
	});

	test("only someone who can update the project can set or remove it", async () => {
		const before = await admin.client.project.find({ projectId: PROJECT });
		await expectCode(
			member.client.project.setBackground({
				projectId: PROJECT,
				image: b64(jpeg),
			}),
			"FORBIDDEN",
		);
		await expectCode(
			member.client.project.removeBackground({ projectId: PROJECT }),
			"FORBIDDEN",
		);
		const after = await admin.client.project.find({ projectId: PROJECT });
		expect(after.backgroundImage).toBe(before.backgroundImage);
	});

	test("rejects anything that isn't an allowed image", async () => {
		for (const text of [
			'<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>',
			"<!doctype html><script>alert(1)</script>",
			"GIF89a",
			"",
		]) {
			await expectCode(
				admin.client.project.setBackground({
					projectId: PROJECT,
					image: b64(Buffer.from(text)),
				}),
				"BAD_REQUEST",
			);
		}
	});

	test("accepts an image right at the limit and rejects one over it", async () => {
		const full = Buffer.concat([
			png,
			Buffer.alloc(MAX_BACKGROUND_BYTES - png.length),
		]);
		await admin.client.project.setBackground({
			projectId: PROJECT,
			image: b64(full),
		});
		const res = await projectBackgroundResponse(admin.headers, PROJECT);
		expect((await res.arrayBuffer()).byteLength).toBe(MAX_BACKGROUND_BYTES);

		await expectCode(
			admin.client.project.setBackground({
				projectId: PROJECT,
				image: b64(Buffer.concat([full, Buffer.alloc(3)])),
			}),
			"BAD_REQUEST",
		);
	});

	test("an archived project refuses a new one", async () => {
		await admin.client.project.archive({ projectId: PROJECT });
		try {
			await expectCode(
				admin.client.project.setBackground({
					projectId: PROJECT,
					image: b64(png),
				}),
				"FORBIDDEN",
			);
		} finally {
			await admin.client.project.unarchive({ projectId: PROJECT });
		}
	});

	test("removing clears it", async () => {
		await admin.client.project.setBackground({
			projectId: PROJECT,
			image: b64(png),
		});
		const project = await admin.client.project.removeBackground({
			projectId: PROJECT,
		});
		expect(project.backgroundImage).toBeNull();
		expect(
			(await projectBackgroundResponse(admin.headers, PROJECT)).status,
		).toBe(404);
	});
});
