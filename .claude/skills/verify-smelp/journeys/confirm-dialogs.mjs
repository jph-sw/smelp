// Feature: confirm dialogs (SMELP-25). Each confirm dialog stays open, with its
// button busy, while its request is held, and closes once the request finishes.
import fs from "node:fs";
import path from "node:path";

const rpc = async (page, procedure, json) => {
	const res = await page.request.post(`/rpc/${procedure}`, { data: { json } });
	const body = await res.json();
	if (res.status() !== 200) throw new Error(`${procedure} ${res.status()} ${JSON.stringify(body)}`);
	return body.json;
};

export default async ({ page, seed, step, shot, aria, expect, evidenceDir }) => {
	const ws = seed.workspaceId;

	async function holdsUntilDone({ name, procedure, open, confirm, after }) {
		step(`${name}: confirm with the request held`);
		let release;
		const held = new Promise((r) => (release = r));
		let seen = false;
		await page.route(`**/rpc/${procedure}`, async (route) => {
			seen = true;
			await held;
			await route.continue();
		});
		await open();
		const dialog = page.getByRole("alertdialog");
		await dialog.waitFor();
		const button = dialog.getByRole("button", { name: confirm, exact: true });
		await button.click();
		await page.waitForTimeout(800);
		expect(seen, `${name}: request is in flight`);
		expect(await dialog.isVisible(), `${name}: dialog stays open while the request is held`);
		expect((await button.getAttribute("aria-busy")) === "true", `${name}: confirm button is busy`);
		await page.keyboard.press("Escape");
		await dialog.getByRole("button", { name: "Cancel" }).click();
		expect(await dialog.isVisible(), `${name}: Escape and Cancel don't close it`);
		await shot(`${name}-pending`);
		await aria(`${name}-pending`, dialog);
		release();
		await dialog.waitFor({ state: "hidden" });
		await page.unroute(`**/rpc/${procedure}`);
		await after();
		await shot(`${name}-after`);
	}

	step("Setup: projects, a workspace, a module and a cycle to act on");
	for (const id of ["ARC", "DEL"])
		await rpc(page, "project/create", { id, name: `${id} project`, description: "", access: "public", icon: "", workspaceId: ws });
	const doomed = await rpc(page, "workspace/create", { name: "Doomed Team" });
	const module = await rpc(page, "modules/create", { projectId: seed.projectId, name: "Doomed module" });
	const cycle = await rpc(page, "cycles/create", { projectId: seed.projectId, name: "Doomed cycle", startDate: "2026-11-01", endDate: "2026-11-30" });
	const csvPath = path.join(evidenceDir, "jira.csv");
	fs.writeFileSync(csvPath, "Summary,Issue key,Issue Type,Status,Project key,Project name\nImported item,ZQN-1,Task,Open,ZQN,Zequence\n");

	await holdsUntilDone({
		name: "archive-project",
		procedure: "project/archive",
		open: async () => {
			await page.goto(`/${ws}/settings/projects/ARC`);
			await page.getByRole("button", { name: "Archive", exact: true }).click();
		},
		confirm: "Archive project",
		after: async () => {
			await page.getByText("Project archived.").waitFor();
		},
	});

	await holdsUntilDone({
		name: "unarchive-project",
		procedure: "project/unarchive",
		open: async () => {
			await page.getByRole("button", { name: "Unarchive", exact: true }).click();
		},
		confirm: "Unarchive project",
		after: async () => {
			await page.getByText("Project unarchived.").waitFor();
		},
	});

	await holdsUntilDone({
		name: "delete-project",
		procedure: "project/delete",
		open: async () => {
			await page.goto(`/${ws}/settings/projects/DEL`);
			await page.getByRole("button", { name: "Delete", exact: true }).click();
		},
		confirm: "Delete project",
		after: async () => {
			await page.getByText("Project deleted.").waitFor();
			const projects = await rpc(page, "projects/find", { workspaceId: ws });
			expect(!projects.some((p) => p.id === "DEL"), "DEL is gone from the API");
		},
	});

	await holdsUntilDone({
		name: "delete-work-item",
		procedure: "issue/delete",
		open: async () => {
			await page.goto(`/${ws}/browse/${seed.projectId}-1`);
			await page.getByRole("button", { name: "Delete work item" }).click();
		},
		confirm: "Delete work item",
		after: async () => {
			await page.getByText(`Deleted ${seed.projectId}-1.`).waitFor();
		},
	});

	await holdsUntilDone({
		name: "delete-module",
		procedure: "modules/delete",
		open: async () => {
			await page.goto(`/${ws}/projects/${seed.projectId}/modules/${module.id}`);
			await page.getByRole("button", { name: "Delete", exact: true }).click();
		},
		confirm: "Delete module",
		after: async () => {
			await page.getByText("Deleted Doomed module.").waitFor();
		},
	});

	await holdsUntilDone({
		name: "delete-cycle",
		procedure: "cycles/delete",
		open: async () => {
			await page.goto(`/${ws}/projects/${seed.projectId}/cycles/${cycle.id}`);
			await page.getByRole("button", { name: "Delete", exact: true }).click();
		},
		confirm: "Delete cycle",
		after: async () => {
			await page.getByText("Deleted Doomed cycle.").waitFor();
		},
	});

	await holdsUntilDone({
		name: "jira-import",
		procedure: "jiraImport/apply",
		open: async () => {
			await page.goto(`/${ws}/settings/workspace/import`);
			const chooser = page.waitForEvent("filechooser");
			await page.getByRole("button", { name: "Choose CSV file" }).click();
			await (await chooser).setFiles(csvPath);
			await page.getByRole("button", { name: /^Import \d+ work items$/ }).click();
		},
		confirm: "Import",
		after: async () => {
			await page.getByText("Import finished").waitFor();
		},
	});

	await holdsUntilDone({
		name: "delete-workspace",
		procedure: "workspace/delete",
		open: async () => {
			await page.goto(`/${doomed.id}/settings/workspace`);
			await page.getByRole("button", { name: "Delete", exact: true }).click();
		},
		confirm: "Delete workspace",
		after: async () => {
			await page.getByText("Workspace deleted.").waitFor();
		},
	});

	step("Read back the deleted workspace");
	const workspaces = await rpc(page, "workspaces/find", {});
	expect(!workspaces.some((w) => w.id === doomed.id), "Doomed Team is gone from the API");
};
