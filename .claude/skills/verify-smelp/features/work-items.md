# Work items

A member creates a work item in a project, sees it as a card in its state's column on the board, opens it to edit its title, description and fields, and moves it between states.

## Sub-features

- `item-create`: the sidebar `New work item` dialog creates an item in the current project.
- `item-open`: a board card opens the detail page at `/<workspace>/browse/<KEY>`.
- `item-edit`: title and description edit in place on the detail page.
- `item-state`: the `State` combobox moves the item to another column.
- `item-delete`: `Delete work item` removes it.

## How to get to it (user POV)

- Press `New work item` at the top of the sidebar, from any workspace page.
- Press a card (`<KEY> <title>`) on a project board (`/<workspace>/projects/<PROJECT>`), or on the List view (`?view=list`).
- Open a search result (see [search.md](./search.md)).
- Drag a card to another column. This is a second way to change state.

## Driving it with smelp-verify

Preconditions:

- The baseline seed. The board at `/verify_team/projects/VER` shows `Backlog`, `Todo`, `In Progress` and `Done`, with `VER-1 Seeded work item` in Backlog.
- `journeys/create-work-item.mjs` proves `item-create` and `item-open` end to end. Run it as is, or copy it.

Steps:

- **Open board.** `page.goto("/verify_team/projects/VER")`, then wait for `getByRole("heading", { name: "Verification" })`. You see the columns, with counts next to their names.
- **Open dialog.** `getByRole("button", { name: "New work item" }).click()`. `getByRole("dialog", { name: "New work item" })` appears with the text `In Verification`, the `Title` and `Description` textboxes, the `Assignee` combobox, and `Create work item`.
- **Create.** Fill `getByRole("textbox", { name: "Title" })` inside the dialog, then press `Create work item`. The dialog closes, a toast says `Work item "<title>" created.`, and the card `getByRole("button", { name: /^VER-\d+ <title>$/ })` appears at the top of Backlog.
- **Open.** Press the card. The detail page shows `navigation "breadcrumb"` with `Work Items › VER-n`, `textbox "Title"` holding the title, and `region "Activity"` with `vera created this work item`.
- **Edit title.** Fill `textbox "Title"` and blur it (press Tab). Reload, and `inputValue()` returns the new title.
- **Change state.** `getByRole("combobox", { name: "State" }).click()`, then `getByRole("option", { name: "In Progress" }).click()`. The combobox reads `In Progress`. Back on the board, the card is in the `In Progress` column and the counts have changed.
- **Delete.** Press `getByRole("button", { name: "Delete work item" })` and confirm in the dialog that opens. You're back on the board and the card is gone.
- **Proof.** Screenshots of the board before and after, `aria("board", page.getByRole("main"))`, and the stored row read back: `page.request.post("/rpc/issues/search", { data: { json: { workspaceId: "verify_team", query: title } } })`, or `smelp-verify sql "select id, title, state from issue where title = '<title>'"`. The `state` column holds a state id, not a name. Join it to `state` to get the name.

## Gotchas

- The `Description` field is a `<textarea>`. Read it with `inputValue()`. `innerText()` returns an empty string even when it's saved.
- The board is newest-first by design, so new cards go on top of their column.
- A card's accessible name is `<KEY> <title>`, and its `innerText()` puts a newline between the two.
- Dragging uses dnd-kit with pointer sensors, and Playwright's `dragTo` is flaky with it. Prove state changes through the `State` combobox. If you prove dragging, use `page.mouse` down, move in steps, up, and say which path you proved.
- The delete confirmation and the edit-in-place save path haven't been driven yet. Snapshot first and update this file with the real names.
