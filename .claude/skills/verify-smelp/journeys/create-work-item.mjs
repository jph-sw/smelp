// Feature: features/work-items.md (`item-create`, `item-open`).
// Creates a work item from the sidebar dialog, finds it on the board, reopens it
// after a reload, and checks the stored row through the API.
const title = `Journey item ${Date.now()}`;

export default async ({ page, seed, step, shot, aria, expect }) => {
	step("Open the project board");
	await page.goto(`/${seed.workspaceId}/projects/${seed.projectId}`);
	await page.getByRole("heading", { name: seed.projectName }).waitFor();
	await shot("board-before");

	step("Open the New work item dialog from the sidebar");
	await page.getByRole("button", { name: "New work item" }).click();
	const dialog = page.getByRole("dialog", { name: "New work item" });
	await dialog.waitFor();
	expect(await dialog.getByText(`In ${seed.projectName}`).isVisible(), "dialog targets the current project");

	step(`Fill in "${title}" and create it`);
	await dialog.getByRole("textbox", { name: "Title" }).fill(title);
	await dialog.getByRole("textbox", { name: "Description" }).fill("Created by the verify-smelp journey");
	await shot("dialog-filled");
	await dialog.getByRole("button", { name: "Create work item" }).click();
	await dialog.waitFor({ state: "hidden" });

	step("Find the new card on the board");
	const card = page.getByRole("button", { name: new RegExp(`^${seed.projectId}-\\d+ ${title}$`) });
	await card.waitFor();
	const key = (await card.innerText()).match(new RegExp(`${seed.projectId}-\\d+`))?.[0];
	await shot("board-after");
	await aria("board-after", page.getByRole("main"));

	step("Reload and open the card");
	await page.reload();
	await card.click();
	await page.getByRole("textbox", { name: "Title" }).waitFor();
	expect((await page.getByRole("textbox", { name: "Title" }).inputValue()) === title, "title survived the reload");
	expect(
		(await page.getByRole("textbox", { name: "Description" }).inputValue()).includes("Created by the verify-smelp journey"),
		"description was saved",
	);
	await shot("item-detail");

	step("Check the stored row through the API");
	const res = await page.request.post("/rpc/issues/search", {
		data: { json: { workspaceId: seed.workspaceId, query: title } },
	});
	const found = (await res.json()).json;
	expect(res.status() === 200 && found.some((i) => i.title === title), `issues/search returns "${title}" (${key})`);
};
