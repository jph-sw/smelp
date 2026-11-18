export default async function ({ page, seed, step, shot, aria, expect }) {
	const suffix = Date.now();
	const urgentTitle = `Prod is down ${suffix}`;
	const plainTitle = `Tidy the readme ${suffix}`;
	const lowTitle = `Someday maybe ${suffix}`;
	const board = `/${seed.workspaceId}/projects/${seed.projectId}`;
	const cardNamed = (title) =>
		page.getByRole("button", { name: new RegExp(`${seed.projectId}-\\d+ .*${title}$`) });
	const keyOf = async (card) =>
		(await card.innerText()).match(new RegExp(`${seed.projectId}-\\d+`))?.[0];

	async function create(title, priority) {
		await page.getByRole("button", { name: "New work item" }).click();
		const dialog = page.getByRole("dialog", { name: "New work item" });
		await dialog.waitFor();
		await dialog.getByRole("textbox", { name: "Title" }).fill(title);
		const priorityBox = dialog.getByRole("combobox", { name: "Priority", exact: true });
		expect((await priorityBox.innerText()).includes("None"), "the Priority select starts at None");
		if (priority) {
			await priorityBox.click();
			await page.getByRole("option", { name: priority }).click();
			expect((await priorityBox.innerText()).includes(priority), `the Priority select reads ${priority}`);
			await shot(`dialog-${priority}`);
		}
		await dialog.getByRole("button", { name: "Create work item" }).click();
		await dialog.waitFor({ state: "hidden" });
	}

	step("Create items from the dialog, one of them Low");
	await page.goto(board);
	await page.getByRole("heading", { name: seed.projectName }).waitFor();
	await create(urgentTitle);
	await create(plainTitle);
	await create(lowTitle, "Low");
	await cardNamed(lowTitle).getByRole("img", { name: "Low priority" }).waitFor();
	const card = cardNamed(urgentTitle);
	await card.waitFor();
	expect((await card.getByRole("img", { name: /priority$/ }).count()) === 0, "a None item shows no priority icon");
	const key = await keyOf(card);
	expect(Boolean(key), `item key is ${key}`);

	step("Set High on the item page");
	await page.goto(`/${seed.workspaceId}/browse/${key}`);
	const prioritySelect = page.getByRole("combobox", { name: "Priority", exact: true });
	await prioritySelect.waitFor();
	expect((await prioritySelect.innerText()).includes("None"), "detail Priority reads None");
	await prioritySelect.click();
	await shot("priority-options");
	await aria("priority-options", page.getByRole("listbox"));
	await page.getByRole("option", { name: "High" }).click();
	const activity = page.getByRole("region", { name: "Activity" });
	await activity.getByText("changed the priority to High").waitFor();
	await shot("detail-high");

	step("Reload and confirm it persisted");
	await page.reload();
	await prioritySelect.waitFor();
	expect((await prioritySelect.innerText()).includes("High"), "Priority reads High after reload");
	expect(await activity.getByText("changed the priority to High").isVisible(), "issue timeline shows the priority change");
	await shot("detail-high-reloaded");
	await aria("detail-activity", activity);

	step("The board card shows the High icon");
	await page.goto(board);
	await card.waitFor();
	expect((await card.getByRole("img", { name: "High priority" }).count()) === 1, "the card has a High priority icon");
	expect((await cardNamed(plainTitle).getByRole("img", { name: /priority$/ }).count()) === 0, "the other card has none");
	await shot("board-with-high");
	await aria("board-with-high", page.getByRole("main"));

	step("List view shows the icon too");
	await page.goto(`${board}?view=list`);
	const row = page.getByRole("row", { name: new RegExp(`${key} .*${urgentTitle}`) });
	await row.waitFor();
	expect((await row.getByRole("img", { name: "High priority" }).count()) === 1, "the list row has a High priority icon");
	await shot("list-with-high");

	step("Filter the board by High");
	await page.goto(board);
	await page.getByRole("heading", { name: seed.projectName }).waitFor();
	await page.getByRole("combobox", { name: "Filter by priority" }).click();
	await page.getByRole("option", { name: "High" }).click();
	await page.waitForURL(/priority=high/);
	await card.waitFor();
	const cards = page.getByRole("main").locator('a[href*="/browse/"]');
	const highCards = cards.filter({ has: page.getByRole("img", { name: "High priority" }) });
	expect(
		(await cards.count()) > 0 && (await cards.count()) === (await highCards.count()),
		`only High cards shown: ${await highCards.count()} of ${await cards.count()}`,
	);
	expect((await cardNamed(plainTitle).count()) === 0, "the None item is filtered out");
	expect((await cardNamed(lowTitle).count()) === 0, "the Low item is filtered out");
	expect((await page.getByRole("button", { name: new RegExp(`${seed.issue.id} `) }).count()) === 0, "the seeded item is filtered out");
	await shot("board-filtered-high");
	await aria("board-filtered-high", page.getByRole("main"));

	step("Reload keeps the filter");
	await page.reload();
	await card.waitFor();
	expect((await page.getByRole("combobox", { name: "Filter by priority" }).innerText()).includes("High"), "filter still reads High");

	step("Workspace activity feed shows the sentence");
	await page.goto(`/${seed.workspaceId}/settings/workspace/activity`);
	await page.getByText(new RegExp(`changed the priority of ${key} to High`)).first().waitFor();
	await shot("workspace-activity");

	step("Stored row");
	const found = await page.request.post("/rpc/issue/find", { data: { json: { issueId: key } } });
	const stored = (await found.json()).json;
	expect(stored.priority === "high", `stored priority of ${key} is ${stored.priority}`);
}
