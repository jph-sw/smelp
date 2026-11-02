import { beforeEach, describe, expect, test } from "bun:test";
import { createRouterClient } from "@orpc/server";

// Imported dynamically so setup.ts points the database at a temp file first.
await import("./setup");
const { Auth } = await import("@smelp/auth");
const { DB } = await import("@smelp/db");
const { router } = await import("../src/router");
const { avatarResponse, MAX_AVATAR_BYTES } = await import("../src/lib/avatars");

const sql = new DB().sqlite;
const auth = new Auth();

const expectCode = (call: Promise<unknown>, code: string) =>
	expect(call).rejects.toMatchObject({ code });

let counter = 0;
async function createUser() {
	counter += 1;
	const { session, user } = await auth.signUp(
		`profile-${counter}@example.test`,
		`Profile ${counter}`,
		`profile-${counter}`,
		"correct-horse-battery",
	);
	const headers = new Headers({
		cookie: `auth_session=${session.authSessionToken}`,
	});
	return {
		id: user.id,
		displayName: user.displayName,
		headers,
		client: createRouterClient(router, {
			context: { headers, ip: "198.18.2.1" },
		}),
	};
}

const signedOut = createRouterClient(router, {
	context: { headers: new Headers(), ip: "198.18.2.2" },
});

const png = Buffer.from([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 0, 255,
]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9, 9]);
const webp = Buffer.concat([
	Buffer.from("RIFF"),
	Buffer.from([1, 2, 3, 4]),
	Buffer.from("WEBPVP8 "),
]);
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

const userRow = async (id: string) =>
	(await sql`SELECT * FROM auth_user WHERE id = ${id}`)[0] as {
		fullName: string;
		displayName: string;
		image: string | null;
		email: string;
		role: string;
	};

let user: Awaited<ReturnType<typeof createUser>>;
beforeEach(async () => {
	user = await createUser();
});

describe("updating a profile", () => {
	test("changes the signed-in user's own names, trimmed", async () => {
		const other = await createUser();
		await user.client.auth.updateProfile({
			fullName: "  Aleksandra Wiśniewska  ",
			displayName: `  ola-${counter} `,
		});
		const row = await userRow(user.id);
		expect(row.fullName).toBe("Aleksandra Wiśniewska");
		expect(row.displayName).toBe(`ola-${counter}`);
		expect((await userRow(other.id)).displayName).toBe(other.displayName);
	});

	test("can keep the same display name", async () => {
		await user.client.auth.updateProfile({
			fullName: "New name",
			displayName: user.displayName,
		});
		expect((await userRow(user.id)).fullName).toBe("New name");
	});

	test("display names stay unique", async () => {
		const other = await createUser();
		const call = user.client.auth.updateProfile({
			fullName: "Copycat",
			displayName: other.displayName,
		});
		await expectCode(call, "CONFLICT");
		await expect(call).rejects.toThrow("already taken");
		expect((await userRow(user.id)).displayName).toBe(user.displayName);
	});

	test("rejects blank and over-long names", async () => {
		for (const input of [
			{ fullName: "   ", displayName: "fine" },
			{ fullName: "Fine", displayName: "   " },
			{ fullName: "x".repeat(81), displayName: "fine" },
			{ fullName: "Fine", displayName: "x".repeat(41) },
		]) {
			await expectCode(user.client.auth.updateProfile(input), "BAD_REQUEST");
		}
	});

	test("can't be used to change anything else", async () => {
		const before = await userRow(user.id);
		await user.client.auth.updateProfile({
			fullName: "Sneaky",
			displayName: user.displayName,
			role: "admin",
			email: "taken-over@example.test",
			image: "https://tracker.example.test/pixel.gif",
		} as never);
		const after = await userRow(user.id);
		expect(after.role).toBe(before.role);
		expect(after.email).toBe(before.email);
		expect(after.image).toBeNull();
	});

	test("requires signing in", () =>
		expectCode(
			signedOut.auth.updateProfile({ fullName: "A", displayName: "b" }),
			"UNAUTHORIZED",
		));
});

describe("avatars", () => {
	test("stores the bytes and serves them with the detected type", async () => {
		for (const [bytes, type] of [
			[png, "image/png"],
			[jpeg, "image/jpeg"],
			[webp, "image/webp"],
		] as const) {
			const { image } = await user.client.auth.setAvatar({ image: b64(bytes) });
			expect((await userRow(user.id)).image).toBe(image);

			const res = await avatarResponse(user.headers, user.id);
			expect(res.status).toBe(200);
			expect(res.headers.get("content-type")).toBe(type);
			expect(res.headers.get("x-content-type-options")).toBe("nosniff");
			expect(Buffer.from(await res.arrayBuffer()).equals(bytes)).toBe(true);
		}
	});

	test("replacing one changes its address", async () => {
		const first = await user.client.auth.setAvatar({ image: b64(png) });
		await Bun.sleep(2);
		const second = await user.client.auth.setAvatar({ image: b64(jpeg) });
		expect(second.image).not.toBe(first.image);
		const rows =
			await sql`SELECT userId FROM auth_user_avatar WHERE userId = ${user.id}`;
		expect(rows.length).toBe(1);
	});

	test("rejects anything that isn't an allowed image", async () => {
		for (const text of [
			'<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>',
			"<!doctype html><script>alert(1)</script>",
			"GIF89a",
			"",
		]) {
			await expectCode(
				user.client.auth.setAvatar({ image: b64(Buffer.from(text)) }),
				"BAD_REQUEST",
			);
		}
		expect((await userRow(user.id)).image).toBeNull();
	});

	test("rejects images over the limit", async () => {
		const big = Buffer.concat([png, Buffer.alloc(MAX_AVATAR_BYTES + 3)]);
		await expectCode(
			user.client.auth.setAvatar({ image: b64(big) }),
			"BAD_REQUEST",
		);
	});

	test("accepts an image right at the limit", async () => {
		const full = Buffer.concat([
			png,
			Buffer.alloc(MAX_AVATAR_BYTES - png.length),
		]);
		await user.client.auth.setAvatar({ image: b64(full) });
		const res = await avatarResponse(user.headers, user.id);
		expect((await res.arrayBuffer()).byteLength).toBe(MAX_AVATAR_BYTES);
	});

	test("removing clears it", async () => {
		await user.client.auth.setAvatar({ image: b64(png) });
		await user.client.auth.removeAvatar();
		expect((await userRow(user.id)).image).toBeNull();
		expect((await avatarResponse(user.headers, user.id)).status).toBe(404);
	});

	test("only signed-in users can fetch or change one", async () => {
		await user.client.auth.setAvatar({ image: b64(png) });
		const other = await createUser();

		expect((await avatarResponse(new Headers(), user.id)).status).toBe(401);
		expect(
			(
				await avatarResponse(
					new Headers({ cookie: "auth_session=not.valid" }),
					user.id,
				)
			).status,
		).toBe(401);
		expect((await avatarResponse(other.headers, user.id)).status).toBe(200);

		await expectCode(
			signedOut.auth.setAvatar({ image: b64(png) }),
			"UNAUTHORIZED",
		);
		await expectCode(signedOut.auth.removeAvatar(), "UNAUTHORIZED");
	});

	test("someone else's upload doesn't touch yours", async () => {
		const other = await createUser();
		await user.client.auth.setAvatar({ image: b64(png) });
		await other.client.auth.setAvatar({ image: b64(jpeg) });
		await other.client.auth.removeAvatar();
		expect((await avatarResponse(user.headers, user.id)).status).toBe(200);
	});

	test("an unknown user is a 404", async () => {
		expect((await avatarResponse(user.headers, "nobody")).status).toBe(404);
	});
});
