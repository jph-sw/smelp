// Feature: features/work-items.md (`item-create`, `item-edit`).
// Drives the rich-text description end to end: "/" commands in the create dialog
// and on the item page, saving and Escape, image and file uploads, links, a
// hostile stored description, and a read-only guest. Checks the stored Markdown
// through the API after each save.

const title = `Description journey ${Date.now()}`;

export default async ({ page, seed, step, shot, aria, expect, evidenceDir }) => {
	const rpc = async (procedure, json) => {
		const res = await page.request.post(`/rpc/${procedure}`, { data: { json } });
		return (await res.json()).json;
	};
	const stored = async (issueId) => (await rpc("issue/find", { issueId })).description;
	const savedAfter = (action) =>
		Promise.all([
			page.waitForResponse((r) => r.url().includes("/rpc/issue/update") && r.ok()),
			action(),
		]);
	const pngBase64 = (color) =>
		page.evaluate((color) => {
			const canvas = document.createElement("canvas");
			canvas.width = 120;
			canvas.height = 60;
			const ctx = canvas.getContext("2d");
			ctx.fillStyle = color;
			ctx.fillRect(0, 0, 120, 60);
			return canvas.toDataURL("image/png").split(",")[1];
		}, color);

	step("Create a work item from the dialog with / commands");
	await page.goto(`/${seed.workspaceId}/projects/${seed.projectId}`);
	await page.getByRole("heading", { name: seed.projectName }).waitFor();
	await page.getByRole("button", { name: "New work item" }).click();
	const dialog = page.getByRole("dialog", { name: "New work item" });
	await dialog.waitFor();
	await dialog.getByRole("textbox", { name: "Title" }).fill(title);
	const createDesc = dialog.getByRole("textbox", { name: "Description" });
	await createDesc.click();
	await page.keyboard.type("/head");
	await dialog.getByRole("listbox", { name: "Commands" }).waitFor();
	await shot("create-menu");
	await page.keyboard.press("Enter");
	await page.keyboard.type("Plan");
	await page.keyboard.press("Enter");
	await page.keyboard.type("/check");
	await page.keyboard.press("Enter");
	await page.keyboard.type("first task");
	step("Escape in the menu closes only the menu");
	await page.keyboard.type(" /quo");
	await dialog.getByRole("listbox", { name: "Commands" }).waitFor();
	await page.keyboard.press("Escape");
	expect(await dialog.isVisible(), "dialog stays open after Escape in the menu");
	expect(
		(await dialog.getByRole("listbox", { name: "Commands" }).count()) === 0,
		"menu closed",
	);
	expect((await createDesc.innerText()).includes("/quo"), "typed text kept");
	for (let i = 0; i < 5; i++) await page.keyboard.press("Backspace");
	step("Pasting a file in the create dialog doesn't upload");
	const b64 = await pngBase64("#c0392b");
	await createDesc.evaluate(async (el, b64) => {
		const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
		const data = new DataTransfer();
		data.items.add(new File([bytes], "pasted.png", { type: "image/png" }));
		el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
	}, b64);
	await page.getByText("Images can be added once the work item is created.").waitFor();
	expect((await createDesc.locator("img").count()) === 0, "no image inserted in the create dialog");
	await shot("create-filled");
	await dialog.getByRole("button", { name: "Create work item" }).click();
	await dialog.waitFor({ state: "hidden" });
	const card = page.getByRole("button", { name: new RegExp(`^VER-\\d+ ${title}$`) });
	await card.waitFor();
	const key = (await card.innerText()).match(/VER-\d+/)[0];
	const created = await stored(key);
	console.log("stored after create:", JSON.stringify(created));
	expect(created === "# Plan\n\n- [ ] first task", `stored Markdown is clean: ${JSON.stringify(created)}`);

	step("Open the item: description is inline-editable");
	await page.goto(`/${seed.workspaceId}/browse/${key}`);
	const desc = page.getByRole("textbox", { name: "Description" });
	await desc.waitFor();
	expect(await desc.getByRole("heading", { name: "Plan" }).isVisible(), "heading rendered");
	expect(await desc.getByRole("checkbox", { name: "Not done" }).isVisible(), "checkbox rendered");

	step("Add a table and a code block with / and save on blur");
	await desc.getByText("first task").click();
	// ProseMirror reads a click's caret a moment after mouseup.
	await page.waitForTimeout(50);
	await page.keyboard.press("End");
	await page.keyboard.press("Enter");
	await page.keyboard.press("Enter");
	await page.keyboard.type("/table");
	await page.getByRole("option", { name: "Table" }).waitFor();
	await page.keyboard.press("Enter");
	for (const cell of ["Name", "Owner", "Due", "Login", "vera", "Fri"]) {
		await page.keyboard.type(cell);
		await page.keyboard.press("Tab");
	}
	await desc.locator("table").waitFor();
	// Leave the table through the paragraph Tiptap keeps after it.
	await desc.locator(".tableWrapper + p").click();
	await page.keyboard.type("/code");
	await page.keyboard.press("Enter");
	await page.keyboard.type("const answer = 42;");
	await shot("issue-table-code");
	await savedAfter(() => page.getByRole("textbox", { name: "Title" }).click());
	const afterTable = await stored(key);
	console.log("stored after table:", JSON.stringify(afterTable));
	expect(afterTable.includes("| Name") && afterTable.includes("```\nconst answer = 42;\n```"), "table and code block stored as Markdown");

	step("Escape in the menu keeps the edit; Escape outside reverts it");
	await desc.locator("pre").click();
	await page.keyboard.press("ArrowDown");
	await page.keyboard.press("ArrowDown");
	await page.keyboard.type("kept /");
	await page.getByRole("listbox", { name: "Commands" }).waitFor();
	await page.keyboard.press("Escape");
	expect(await desc.evaluate((el) => el === document.activeElement), "editor still focused after menu Escape");
	expect((await desc.innerText()).includes("kept /"), "edit kept after menu Escape");
	await page.keyboard.press("Backspace");
	await page.keyboard.press("Backspace");
	await savedAfter(() => page.keyboard.press("Control+Enter"));
	expect((await stored(key)).endsWith("kept"), "Ctrl+Enter saved the edit");
	await desc.getByText("kept").click();
	await page.keyboard.press("End");
	await page.keyboard.type(" throwaway");
	await page.keyboard.press("Escape");
	expect(!(await desc.innerText()).includes("throwaway"), "Escape reverted the edit");
	expect(!(await stored(key)).includes("throwaway"), "reverted edit not saved");

	step("/image uploads a picked png");
	await desc.getByText("kept").click();
	await page.keyboard.press("End");
	await page.keyboard.press("Enter");
	const chooser = page.waitForEvent("filechooser");
	await page.keyboard.type("/image");
	await page.keyboard.press("Enter");
	await (await chooser).setFiles({
		name: "picked.png",
		mimeType: "image/png",
		buffer: Buffer.from(await pngBase64("#2980b9"), "base64"),
	});
	await desc.locator('img[src^="/api/attachments/"]').first().waitFor();

	step("Pasting a png uploads it, and leaving mid-upload saves once it lands");
	const paste = (name, type, b64) =>
		desc.evaluate(
			async (el, [name, type, b64]) => {
				const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
				const data = new DataTransfer();
				data.items.add(new File([bytes], name, { type }));
				el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
			},
			[name, type, b64],
		);
	await page.keyboard.press("End");
	await page.keyboard.press("Enter");
	let release;
	const held = new Promise((resolve) => {
		release = resolve;
	});
	await page.route("**/api/attachments?*", async (route) => {
		await held;
		await route.continue();
	});
	const updates = [];
	page.on("request", (r) => {
		if (r.url().includes("/rpc/issue/update")) updates.push(Date.now());
	});
	await paste("pasted.png", "image/png", await pngBase64("#27ae60"));
	await desc.locator("img[data-uploading]").waitFor();
	await shot("issue-uploading");
	await page.getByRole("textbox", { name: "Title" }).click();
	await page.waitForTimeout(500);
	expect(updates.length === 0, "no save while the upload is in flight");
	const saved = page.waitForResponse((r) => r.url().includes("/rpc/issue/update") && r.ok());
	release();
	await saved;
	await page.unroute("**/api/attachments?*");
	expect(/!\[pasted\.png\]\(\/api\/attachments\//.test(await stored(key)), "saved with the image once the upload finished");
	await shot("issue-images");

	step("A pasted file that isn't an image goes in as a link");
	await desc.locator('img[src^="/api/attachments/"]').last().click();
	await page.keyboard.press("ArrowRight");
	await page.keyboard.press("Enter");
	await paste("notes.txt", "text/plain", Buffer.from("hello").toString("base64"));
	await desc.getByRole("link", { name: "notes.txt" }).waitFor();

	step("A refused upload is removed and explained");
	await page.route("**/api/attachments?*", (route) =>
		route.fulfill({ status: 415, contentType: "text/plain", body: "This file type isn't allowed." }),
	);
	await page.keyboard.press("End");
	await page.keyboard.press("Enter");
	await paste("refused.png", "image/png", await pngBase64("#8e44ad"));
	await page.getByText("This file type isn't allowed.").waitFor();
	expect((await desc.locator("[data-uploading]").count()) === 0, "placeholder removed after a refused upload");
	await page.unroute("**/api/attachments?*");

	step("/link inserts a link, and Ctrl+click opens it");
	await page.keyboard.type("/link");
	await page.keyboard.press("Enter");
	const address = page.getByRole("textbox", { name: "Link address" });
	await address.fill("javascript:alert(1)");
	await address.press("Enter");
	expect((await address.getAttribute("aria-invalid")) === "true", "unsafe address refused");
	await address.fill("https://example.com/docs");
	await address.press("Enter");
	const link = desc.getByRole("link", { name: "https://example.com/docs" });
	await link.waitFor();
	expect((await link.getAttribute("target")) === "_blank" && (await link.getAttribute("rel")) === "noreferrer noopener", "link opens in a new tab without an opener");
	const popup = page.waitForEvent("popup");
	await link.click({ modifiers: ["Control"] });
	const opened = await popup;
	expect(opened.url().startsWith("https://example.com/docs"), `Ctrl+click opened ${opened.url()}`);
	await opened.close();
	await savedAfter(() => page.getByRole("textbox", { name: "Title" }).click());

	step("Reload: everything renders from the stored Markdown");
	await page.reload();
	await desc.waitFor();
	await page.waitForFunction(
		() => [...document.querySelectorAll('[aria-label="Description"] img[src]')].every((img) => img.complete),
	);
	const widths = await desc.locator("img[src]").evaluateAll((imgs) => imgs.map((img) => img.naturalWidth));
	expect(widths.length === 2 && widths.every((w) => w > 0), `images load after reload (naturalWidth ${widths})`);
	expect(await desc.getByRole("heading", { name: "Plan" }).isVisible(), "heading after reload");
	expect((await desc.locator("table th").count()) === 3, "table header after reload");
	expect(await desc.locator("pre code").isVisible(), "code block after reload");
	await shot("issue-reloaded");
	await aria("issue-description", desc);
	const finalMd = await stored(key);
	console.log("stored final:", JSON.stringify(finalMd));
	expect(/!\[picked\.png\]\(\/api\/attachments\/[\w-]+\)/.test(finalMd), "picked image stored as Markdown image");
	expect(/!\[pasted\.png\]\(\/api\/attachments\/[\w-]+\)/.test(finalMd), "pasted image stored as Markdown image");
	expect(!finalMd.includes("blob:") && !finalMd.includes("Uploading") && !finalMd.includes("refused"), "no upload placeholder stored");
	expect(/\[notes\.txt\]\(\/api\/attachments\/[\w-]+\)/.test(finalMd), "file stored as a link");
	expect(finalMd.includes("[https://example.com/docs](https://example.com/docs)"), "link stored as Markdown");

	step("A hostile description doesn't run or load anything");
	const hostile =
		'<script>window.__xss = "script"</script>\n\n<img src=x onerror="window.__xss = \'onerror\'">\n\n[click me](javascript:window.__xss=\'link\')\n\n![tracker](https://evil.example/pixel.png)';
	await rpc("issue/update", { id: seed.issue.id, description: hostile });
	const dialogs = [];
	page.on("dialog", (d) => {
		dialogs.push(d.message());
		d.dismiss();
	});
	await page.goto(`/${seed.workspaceId}/browse/${seed.issue.id}`);
	await desc.waitFor();
	await desc.getByText("click me").click({ modifiers: ["Control"] });
	await page.waitForTimeout(300);
	const probe = await page.evaluate(() => ({
		xss: window.__xss ?? null,
		scripts: document.querySelectorAll('[aria-label="Description"] script').length,
		imgs: [...document.querySelectorAll('[aria-label="Description"] img[src]')].map((i) => i.src),
		jsLinks: document.querySelectorAll('[aria-label="Description"] a[href^="javascript"]').length,
		trackerLink: document.querySelector('[aria-label="Description"] a[href="https://evil.example/pixel.png"]')?.textContent ?? null,
	}));
	console.log("hostile probe:", JSON.stringify(probe));
	expect(probe.xss === null && dialogs.length === 0, "nothing executed");
	expect(probe.scripts === 0 && probe.imgs.length === 0, "no script or img elements");
	expect(probe.jsLinks === 0, "no javascript: link");
	expect(probe.trackerLink === "tracker", "external image shown as a link");
	expect((await desc.innerText()).includes("<script>"), "raw HTML shown as text");
	await shot("hostile");

	step("A read-only member sees rendered content, not an editor");
	const invite = await rpc("workspaceInvites/create", { workspaceId: seed.workspaceId, role: "member" });
	const browser = page.context().browser();
	const other = await browser.newContext({ baseURL: new URL(page.url()).origin });
	const reader = await other.newPage();
	const signUp = await reader.request.post("/rpc/auth/signUp", {
		data: {
			json: {
				email: `reader-${Date.now()}@example.test`,
				fullName: "Read Only",
				displayName: `reader${Date.now() % 100000}`,
				password: "correct-horse-battery",
				inviteToken: invite.token,
			},
		},
	});
	expect(signUp.ok(), `reader signed up (${signUp.status()})`);
	const accepted = await reader.request.post("/rpc/workspaceInvites/accept", { data: { json: { token: invite.token } } });
	expect(accepted.ok(), "reader joined the workspace");
	const me = (await (await reader.request.post("/rpc/auth/me", { data: { json: {} } })).json()).json;
	const userId = me.user.id;
	const added = await page.request.post("/rpc/projectMembers/add", { data: { json: { projectId: seed.projectId, userId, role: "guest" } } });
	expect(added.ok(), "reader is a guest on the project");
	await reader.goto(`/${seed.workspaceId}/browse/${key}`);
	await reader.getByRole("heading", { name: "Plan" }).waitFor();
	const readOnly = await reader.evaluate(() => {
		const root = document.querySelector('[aria-label="Description"]');
		return {
			editable: root?.getAttribute("contenteditable"),
			role: root?.getAttribute("role"),
			checkboxDisabled: root?.querySelector('input[type="checkbox"]')?.disabled,
			imgs: [...(root?.querySelectorAll("img[src]") ?? [])].map((img) => img.naturalWidth),
		};
	});
	console.log("read-only:", JSON.stringify(readOnly));
	expect(readOnly.editable === "false" && readOnly.role !== "textbox", "description isn't editable");
	expect(readOnly.checkboxDisabled === true, "checkbox disabled for a reader");
	expect(readOnly.imgs.length === 2 && readOnly.imgs.every((w) => w > 0), "reader sees the images");
	expect((await reader.getByRole("textbox", { name: "Description" }).count()) === 0, "no Description textbox");
	await reader.screenshot({ path: `${evidenceDir}/read-only.png`, fullPage: true });
	await other.close();
};
