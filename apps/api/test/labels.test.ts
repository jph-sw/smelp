import { beforeAll, describe, expect, test } from "bun:test";
import { createRouterClient } from "@orpc/server";

// Imported dynamically so setup.ts points the database at a temp file first.
await import("./setup");
const { Auth } = await import("@smelp/auth");
const { DB } = await import("@smelp/db");
const { router } = await import("../src/router");

const sql = new DB().sqlite;
const auth = new Auth();

const WORKSPACE = "label_tests";
const PROJECT = "LBA";
const OTHER_PROJECT = "LBB";
const PRIVATE_PROJECT = "LBP";

const expectCode = (call: Promise<unknown>, code: string) =>
	expect(call).rejects.toMatchObject({ code });

let userCount = 0;
async function createUser(name: string) {
	userCount += 1;
	const { session, user } = await auth.signUp(
		`lbl-${name}-${userCount}@example.test`,
		name,
		`lbl-${name}-${userCount}`,
		"correct-horse-battery",
	);
	const headers = new Headers({
		cookie: `auth_session=${session.authSessionToken}`,
	});
	return {
		id: user.id,
		client: createRouterClient(router, {
			context: { headers, ip: "198.51.100.13" },
		}),
	};
}
type User = Awaited<ReturnType<typeof createUser>>;

let admin: User;
let member: User;
let guest: User;
let outsider: User;
const firstState: Record<string, string> = {};

async function addMember(spaceId: string, userId: string, role: string) {
	await sql`INSERT INTO auth_space_member ${sql({
		id: crypto.randomUUID(),
		spaceId,
		userId,
		role,
		createdAt: Date.now(),
	})}`;
}

async function newItem(title: string, projectId = PROJECT) {
	return member.client.issue.create({
		title,
		description: "",
		state: firstState[projectId] ?? "",
		workspaceId: WORKSPACE,
		projectId,
	});
}

const labelEntries = async (issueId: string) =>
	(await member.client.activity.findForIssue({ issueId })).filter(
		(entry) =>
			entry.action === "issue.label_added" ||
			entry.action === "issue.label_removed",
	);

// Events are saved a moment after the request returns, so wait for them.
async function waitForActivity(
	issueId: string,
	done: (entries: Awaited<ReturnType<typeof labelEntries>>) => boolean,
) {
	for (let attempt = 0; attempt < 100; attempt++) {
		const entries = await member.client.activity.findForIssue({ issueId });
		if (done(entries)) return entries;
		await Bun.sleep(10);
	}
	throw new Error(`The activity of ${issueId} never got there`);
}

const boardLabels = async (
	issueId: string,
	client: User["client"] = member.client,
) =>
	(await client.issues.find({ projectId: PROJECT })).find(
		(item) => item.id === issueId,
	)?.labelIds;

beforeAll(async () => {
	admin = await createUser("admin");
	member = await createUser("member");
	guest = await createUser("guest");
	outsider = await createUser("outsider");

	await admin.client.workspace.create({ name: "Label tests" });
	for (const [id, access] of [
		[PROJECT, "public"],
		[OTHER_PROJECT, "public"],
		[PRIVATE_PROJECT, "private"],
	] as const) {
		await admin.client.project.create({
			id,
			name: `Project ${id}`,
			description: "",
			access,
			icon: "AppWindowIcon",
			workspaceId: WORKSPACE,
		});
		const [state] = await admin.client.states.find({ projectId: id });
		firstState[id] = state?.id ?? "";
	}
	for (const user of [member, guest, outsider]) {
		await addMember(WORKSPACE, user.id, "member");
	}
	await addMember(PROJECT, member.id, "member");
	await addMember(PROJECT, guest.id, "guest");
	await addMember(OTHER_PROJECT, member.id, "member");
});

describe("managing labels", () => {
	test("admins create, rename, recolor and delete labels, listed by name", async () => {
		const zebra = await admin.client.labels.create({
			projectId: PROJECT,
			name: "  zebra  ",
			color: "#AABBCC",
		});
		expect(zebra).toMatchObject({
			projectId: PROJECT,
			name: "zebra",
			color: "#aabbcc",
		});
		const apple = await admin.client.labels.create({
			projectId: PROJECT,
			name: "Apple",
			color: "#112233",
		});
		const mango = await admin.client.labels.create({
			projectId: PROJECT,
			name: "mango",
			color: "#445566",
		});

		const names = async () =>
			(await guest.client.labels.find({ projectId: PROJECT })).map(
				(l) => l.name,
			);
		expect(await names()).toEqual(["Apple", "mango", "zebra"]);

		const renamed = await admin.client.labels.update({
			id: zebra.id,
			name: "Aardvark",
		});
		expect(renamed).toMatchObject({ name: "Aardvark", color: "#aabbcc" });
		const recolored = await admin.client.labels.update({
			id: zebra.id,
			color: "#000000",
		});
		expect(recolored).toMatchObject({ name: "Aardvark", color: "#000000" });
		expect(await names()).toEqual(["Aardvark", "Apple", "mango"]);

		await admin.client.labels.delete({ id: mango.id });
		await admin.client.labels.delete({ id: apple.id });
		await admin.client.labels.delete({ id: zebra.id });
		expect(await names()).toEqual([]);
		await expectCode(admin.client.labels.delete({ id: zebra.id }), "NOT_FOUND");
	});

	test("names are unique per project whatever their case", async () => {
		const label = await admin.client.labels.create({
			projectId: PROJECT,
			name: "Frontend",
			color: "#336699",
		});
		await expectCode(
			admin.client.labels.create({
				projectId: PROJECT,
				name: "FRONTEND",
				color: "#336699",
			}),
			"CONFLICT",
		);
		const backend = await admin.client.labels.create({
			projectId: PROJECT,
			name: "backend",
			color: "#336699",
		});
		await expectCode(
			admin.client.labels.update({ id: backend.id, name: "frontend" }),
			"CONFLICT",
		);
		// Another project can use the same name.
		const elsewhere = await admin.client.labels.create({
			projectId: OTHER_PROJECT,
			name: "frontend",
			color: "#336699",
		});
		expect(elsewhere.name).toBe("frontend");

		for (const id of [label.id, backend.id, elsewhere.id]) {
			await admin.client.labels.delete({ id });
		}
	});

	test("names and colors are checked", async () => {
		for (const input of [
			{ name: "   ", color: "#336699" },
			{ name: "x".repeat(33), color: "#336699" },
			{ name: "ok", color: "blue" },
			{ name: "ok", color: "#3366" },
		]) {
			await expectCode(
				admin.client.labels.create({ projectId: PROJECT, ...input }),
				"BAD_REQUEST",
			);
		}
	});

	test("members and guests can't manage labels", async () => {
		await expectCode(
			member.client.labels.create({
				projectId: PROJECT,
				name: "Nope",
				color: "#336699",
			}),
			"FORBIDDEN",
		);
		await expectCode(
			guest.client.labels.create({
				projectId: PROJECT,
				name: "Nope",
				color: "#336699",
			}),
			"FORBIDDEN",
		);
		const label = await admin.client.labels.create({
			projectId: PROJECT,
			name: "Admins only",
			color: "#336699",
		});
		await expectCode(
			member.client.labels.update({ id: label.id, name: "Mine" }),
			"FORBIDDEN",
		);
		await expectCode(
			member.client.labels.delete({ id: label.id }),
			"FORBIDDEN",
		);
		expect(
			(await member.client.labels.find({ projectId: PROJECT })).map(
				(l) => l.name,
			),
		).toEqual(["Admins only"]);
		await admin.client.labels.delete({ id: label.id });
	});

	test("a private project's labels don't show to people outside it", async () => {
		const secret = await admin.client.labels.create({
			projectId: PRIVATE_PROJECT,
			name: "Secret",
			color: "#336699",
		});
		await expectCode(
			outsider.client.labels.find({ projectId: PRIVATE_PROJECT }),
			"NOT_FOUND",
		);
		await expectCode(
			outsider.client.labels.update({ id: secret.id, name: "x" }),
			"NOT_FOUND",
		);
		await expectCode(
			outsider.client.labels.delete({ id: secret.id }),
			"NOT_FOUND",
		);
	});
});

describe("labels on work items", () => {
	test("members set an item's labels and the board and the item show them by name", async () => {
		const ux = await admin.client.labels.create({
			projectId: PROJECT,
			name: "ux",
			color: "#aa0000",
		});
		const bug = await admin.client.labels.create({
			projectId: PROJECT,
			name: "Customer-reported",
			color: "#00aa00",
		});
		const item = await newItem("Checkout looks off");
		const plain = await newItem("No labels here");

		const set = await member.client.issue.setLabels({
			id: item.id,
			labelIds: [ux.id, bug.id],
		});
		expect(set.labelIds).toEqual([bug.id, ux.id]);
		expect(await boardLabels(item.id)).toEqual([bug.id, ux.id]);
		expect(await boardLabels(item.id, guest.client)).toEqual([bug.id, ux.id]);
		expect(await boardLabels(plain.id)).toEqual([]);
		expect(
			(await guest.client.issue.find({ issueId: item.id })).labelIds,
		).toEqual([bug.id, ux.id]);

		const cleared = await member.client.issue.setLabels({
			id: item.id,
			labelIds: [],
		});
		expect(cleared.labelIds).toEqual([]);
		expect(
			(await member.client.issue.find({ issueId: item.id })).labelIds,
		).toEqual([]);

		await admin.client.labels.delete({ id: ux.id });
		await admin.client.labels.delete({ id: bug.id });
	});

	test("adding and removing labels shows in the item's activity", async () => {
		const a = await admin.client.labels.create({
			projectId: PROJECT,
			name: "alpha",
			color: "#aa0000",
		});
		const b = await admin.client.labels.create({
			projectId: PROJECT,
			name: "beta",
			color: "#00aa00",
		});
		const item = await newItem("Logged");

		await member.client.issue.setLabels({ id: item.id, labelIds: [a.id] });
		await member.client.issue.setLabels({ id: item.id, labelIds: [b.id] });
		await waitForActivity(
			item.id,
			(entries) =>
				entries.filter((entry) => entry.action.startsWith("issue.label_"))
					.length >= 3,
		);
		const entries = (await labelEntries(item.id)).map((entry) => [
			entry.action,
			entry.oldValue,
			entry.newValue,
		]);
		expect(entries).toEqual([
			["issue.label_added", null, "alpha"],
			["issue.label_added", null, "beta"],
			["issue.label_removed", "alpha", null],
		]);

		// The log keeps the name the label had, after it's renamed.
		await admin.client.labels.update({ id: b.id, name: "gamma" });
		expect((await labelEntries(item.id)).at(1)?.newValue).toBe("beta");

		await admin.client.labels.delete({ id: a.id });
		await admin.client.labels.delete({ id: b.id });
	});

	test("setting the same labels again changes and logs nothing", async () => {
		const label = await admin.client.labels.create({
			projectId: PROJECT,
			name: "same",
			color: "#aa0000",
		});
		const item = await newItem("Set twice");
		await member.client.issue.setLabels({ id: item.id, labelIds: [label.id] });
		await waitForActivity(item.id, (entries) =>
			entries.some((entry) => entry.action === "issue.label_added"),
		);
		const before = await member.client.issue.find({ issueId: item.id });

		const again = await member.client.issue.setLabels({
			id: item.id,
			labelIds: [label.id, label.id],
		});
		expect(again.labelIds).toEqual([label.id]);
		expect(
			(await member.client.issue.find({ issueId: item.id })).updatedAt,
		).toBe(before.updatedAt);
		// A later change is logged after anything the repeat could have logged.
		await member.client.issue.update({ id: item.id, title: "Set twice, done" });
		await waitForActivity(item.id, (entries) =>
			entries.some((entry) => entry.field === "title"),
		);

		expect((await labelEntries(item.id)).length).toBe(1);
		await admin.client.labels.delete({ id: label.id });
	});

	test("only the item's own project's labels can be set", async () => {
		const own = await admin.client.labels.create({
			projectId: PROJECT,
			name: "own",
			color: "#aa0000",
		});
		const foreign = await admin.client.labels.create({
			projectId: OTHER_PROJECT,
			name: "foreign",
			color: "#aa0000",
		});
		const item = await newItem("Mixed labels");
		await expectCode(
			member.client.issue.setLabels({
				id: item.id,
				labelIds: [own.id, foreign.id],
			}),
			"BAD_REQUEST",
		);
		await expectCode(
			member.client.issue.setLabels({ id: item.id, labelIds: ["missing"] }),
			"BAD_REQUEST",
		);
		expect(await boardLabels(item.id)).toEqual([]);

		await admin.client.labels.delete({ id: own.id });
		await admin.client.labels.delete({ id: foreign.id });
	});

	test("guests and outsiders can't set labels", async () => {
		const label = await admin.client.labels.create({
			projectId: PROJECT,
			name: "locked",
			color: "#aa0000",
		});
		const item = await newItem("Not yours to label");
		await expectCode(
			guest.client.issue.setLabels({ id: item.id, labelIds: [label.id] }),
			"FORBIDDEN",
		);
		await expectCode(
			outsider.client.issue.setLabels({ id: item.id, labelIds: [label.id] }),
			"FORBIDDEN",
		);
		await expectCode(
			member.client.issue.setLabels({ id: "LBA-999", labelIds: [] }),
			"NOT_FOUND",
		);
		expect(await boardLabels(item.id)).toEqual([]);
		await admin.client.labels.delete({ id: label.id });
	});

	test("deleting a label takes it off every item and logs that on each", async () => {
		const doomed = await admin.client.labels.create({
			projectId: PROJECT,
			name: "doomed",
			color: "#aa0000",
		});
		const kept = await admin.client.labels.create({
			projectId: PROJECT,
			name: "kept",
			color: "#00aa00",
		});
		const one = await newItem("First tagged");
		const two = await newItem("Second tagged");
		await member.client.issue.setLabels({
			id: one.id,
			labelIds: [doomed.id, kept.id],
		});
		await member.client.issue.setLabels({ id: two.id, labelIds: [doomed.id] });

		await admin.client.labels.delete({ id: doomed.id });
		expect(await boardLabels(one.id)).toEqual([kept.id]);
		expect(await boardLabels(two.id)).toEqual([]);

		for (const item of [one, two]) {
			const entries = await waitForActivity(item.id, (all) =>
				all.some((entry) => entry.action === "issue.label_removed"),
			);
			expect(
				entries
					.filter((entry) => entry.action === "issue.label_removed")
					.map((entry) => entry.oldValue),
			).toEqual(["doomed"]);
		}
		await admin.client.labels.delete({ id: kept.id });
	});

	test("at most 50 labels go on one item", async () => {
		const item = await newItem("Overloaded");
		await expectCode(
			member.client.issue.setLabels({
				id: item.id,
				labelIds: Array.from({ length: 51 }, (_, n) => `label-${n}`),
			}),
			"BAD_REQUEST",
		);
	});
});
