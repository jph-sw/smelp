export default async function ({ page, seed, step, shot, aria, expect }) {
	const suffix = Date.now();
	const bugTitle = `Crashes on save ${suffix}`;
	const taskTitle = `Plain chore ${suffix}`;
	const board = `/${seed.workspaceId}/projects/${seed.projectId}`;
	const cardNamed = (title) =>
		page.getByRole("button", { name: new RegExp(`${seed.projectId}-\\d+ ${title}$`) });

	async function create(title, type) {
		await page.getByRole("button", { name: "New work item" }).click();
		const dialog = page.getByRole("dialog", { name: "New work item" });
		await dialog.waitFor();
		await dialog.getByRole("textbox", { name: "Title" }).fill(title);
		const typeBox = dialog.getByRole("combobox", { name: "Type", exact: true });
		expect((await typeBox.innerText()).includes("Task"), "the Type select starts at Task");
		if (type) {
			await typeBox.click();
			await shot(`type-options-${type}`);
			await aria(`type-options-${type}`, page.getByRole("listbox"));
			await page.getByRole("option", { name: type }).click();
			expect((await typeBox.innerText()).includes(type), `the Type select reads ${type}`);
			await shot(`dialog-${type}`);
		}
		await dialog.getByRole("button", { name: "Create work item" }).click();
		await dialog.waitFor({ state: "hidden" });
	}

	step("Create a Bug and a Task from the dialog");
	await page.goto(board);
	await page.getByRole("heading", { name: seed.projectName }).waitFor();
	await create(bugTitle, "Bug");
	await create(taskTitle);

	step("The board card shows the bug icon");
	const bugCard = cardNamed(bugTitle);
	await bugCard.waitFor();
	expect((await bugCard.getByRole("img", { name: "Bug" }).count()) === 1, "the bug card has a Bug icon");
	expect((await cardNamed(taskTitle).getByRole("img", { name: "Task" }).count()) === 1, "the task card has a Task icon");
	await shot("board-with-bug");
	await aria("board-with-bug", page.getByRole("main"));
	const key = (await bugCard.innerText()).match(new RegExp(`${seed.projectId}-\\d+`))?.[0];
	expect(Boolean(key), `bug key is ${key}`);

	step("List view shows the icon before the key");
	await page.goto(`${board}?view=list`);
	await page.getByRole("row", { name: new RegExp(`${key} ${bugTitle}`) }).waitFor();
	expect(
		(await page.getByRole("row", { name: new RegExp(`${key} ${bugTitle}`) }).getByRole("img", { name: "Bug" }).count()) === 1,
		"the list row has a Bug icon",
	);
	await shot("list-with-bug");

	step("Change it to Story on the detail page");
	await page.goto(`/${seed.workspaceId}/browse/${key}`);
	const typeSelect = page.getByRole("combobox", { name: "Type", exact: true });
	await typeSelect.waitFor();
	expect((await typeSelect.innerText()).includes("Bug"), "detail Type reads Bug");
	await shot("detail-bug");
	await typeSelect.click();
	await page.getByRole("option", { name: "Story" }).click();
	await page.getByRole("region", { name: "Activity" }).getByText("changed the type to Story").waitFor();
	await shot("detail-story");

	step("Reload and confirm it persisted");
	await page.reload();
	await typeSelect.waitFor();
	expect((await typeSelect.innerText()).includes("Story"), "Type reads Story after reload");
	expect((await typeSelect.locator("svg").count()) === 1, "the Type trigger shows the type icon before the list opens");
	expect(
		(await page.getByRole("img", { name: "Story" }).count()) >= 1,
		"the detail header shows the Story icon",
	);
	const activity = page.getByRole("region", { name: "Activity" });
	expect(await activity.getByText("changed the type to Story").isVisible(), "issue timeline shows the type change");
	await shot("detail-story-reloaded");
	await aria("detail-activity", activity);

	step("Workspace activity feed shows the sentence");
	await page.goto(`/${seed.workspaceId}/settings/workspace/activity`);
	const feedLine = page.getByText(new RegExp(`changed the type of ${key} to Story`));
	await feedLine.first().waitFor();
	await shot("workspace-activity");

	step("Filter the board by Bug");
	await create(`Second bug ${suffix}`, "Bug");
	await page.goto(board);
	await page.getByRole("heading", { name: seed.projectName }).waitFor();
	await page.getByRole("combobox", { name: "Filter by type" }).click();
	await page.getByRole("option", { name: "Bug" }).click();
	await page.waitForURL(/type=bug/);
	await cardNamed(`Second bug ${suffix}`).waitFor();
	const icons = await page.getByRole("main").locator('a[href*="/browse/"] [role="img"]').evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
	expect(icons.length > 0 && icons.every((label) => label === "Bug"), `only bugs shown: ${icons.join(",")}`);
	expect((await cardNamed(taskTitle).count()) === 0, "the task is filtered out");
	expect((await cardNamed(bugTitle).count()) === 0, "the item now a Story is filtered out");
	await shot("board-filtered-bug");
	await aria("board-filtered-bug", page.getByRole("main"));

	step("Reload keeps the filter");
	await page.reload();
	await cardNamed(`Second bug ${suffix}`).waitFor();
	expect((await page.getByRole("combobox", { name: "Filter by type" }).innerText()).includes("Bug"), "filter still reads Bug");

	step("Stored rows");
	const found = await page.request.post("/rpc/issue/find", { data: { json: { issueId: key } } });
	const stored = (await found.json()).json;
	expect(stored.type === "story", `stored type of ${key} is ${stored.type}`);
}
