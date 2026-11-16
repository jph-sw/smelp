# Work items

A member creates a work item in a project, sees it as a card in its state's column on the board, opens it to edit its title, description and fields, and moves it between states. Every item has a type (Task, Bug, Story or Epic), shown as a colored icon before its key.

## Sub-features

- `item-create`: the sidebar `New work item` dialog creates an item in the current project.
- `item-open`: a board card opens the detail page at `/<workspace>/browse/<KEY>`.
- `item-edit`: title and description edit in place on the detail page. The description is a rich-text editor (Tiptap), stored as Markdown, with a `/` command menu and image uploads.
- `item-state`: the `State` combobox moves the item to another column.
- `item-type`: the `Type` select in the dialog (default Task) and on the detail page sets the type. Cards, list rows and the detail header show its icon, the board's `Filter by type` select narrows to one type, and a change is logged as `changed the type to <Type>`.
- `item-delete`: `Delete work item` removes it.

## How to get to it (user POV)

- Press `New work item` at the top of the sidebar, from any workspace page.
- Press a card (`<Type> <KEY> <title>`) on a project board (`/<workspace>/projects/<PROJECT>`), or on the List view (`?view=list`).
- Open a search result (see [search.md](./search.md)).
- Drag a card to another column. This is a second way to change state.

## Driving it with smelp-verify

Preconditions:

- The baseline seed. The board at `/verify_team/projects/VER` shows `Backlog`, `Todo`, `In Progress` and `Done`, with `VER-1 Seeded work item` in Backlog.
- `journeys/create-work-item.mjs` proves `item-create` and `item-open` end to end. Run it as is, or copy it.
- `journeys/issue-types.mjs` proves `item-type`: a Bug from the dialog, its icon on the board and list, the change to Story on the detail page across a reload, both activity lines, and the board filtered by Bug.
- `journeys/edit-description.mjs` proves the description editor: `/` commands in the dialog and on the item page, blur and Ctrl+Enter saves, Escape, image and file uploads (picked, pasted, refused, saved after an upload in flight), `/link`, a hostile stored description, and a read-only guest.

Steps:

- **Open board.** `page.goto("/verify_team/projects/VER")`, then wait for `getByRole("heading", { name: "Verification" })`. You see the columns, with counts next to their names.
- **Open dialog.** `getByRole("button", { name: "New work item" }).click()`. `getByRole("dialog", { name: "New work item" })` appears with the text `In Verification`, the `Title` and `Description` textboxes, the `Type` and `Assignee` comboboxes, and `Create work item`.
- **Create.** Fill `getByRole("textbox", { name: "Title" })` inside the dialog, then press `Create work item`. The dialog closes, a toast says `Work item "<title>" created.`, and the card `getByRole("button", { name: /^Task VER-\d+ <title>$/ })` appears at the top of Backlog.
- **Open.** Press the card. The detail page shows `navigation "breadcrumb"` with `Work Items › VER-n`, `textbox "Title"` holding the title, and `region "Activity"` with `vera created this work item`.
- **Edit title.** Fill `textbox "Title"` and blur it (press Tab). Reload, and `inputValue()` returns the new title.
- **Edit description.** On the detail page the description is always an editor, `textbox "Description"` (a contenteditable, not a `<textarea>`), with the hint `Type / for commands` under it. Click into it and type `/` after a space or at a line start to open `listbox "Commands"`, with options `Heading 1`-`Heading 3`, `Bulleted list`, `Numbered list`, `Checklist`, `Quote`, `Code block`, `Divider`, `Table`, `Link` and `Image`. Arrow keys and Enter or a click choose one. Escape closes only the menu. Leaving the field or Ctrl+Enter saves when something changed, and Escape outside the menu goes back to the saved text. `Link` opens `textbox "Link address"` at the caret. `Image` opens a file picker. Pasting or dropping a file uploads it: images show faded until the upload lands, other files go in as a link. The create dialog has the same editor without `Image`, and pasting a file there shows `Images can be added once the work item is created.`
- **Set and change type.** In the dialog, `dialog.getByRole("combobox", { name: "Type" })` reads `Task`. Click it and pick `getByRole("option", { name: "Bug" })`. The new card holds `getByRole("img", { name: "Bug" })` before its key. On the detail page use `getByRole("combobox", { name: "Type", exact: true })` and pick `Story`. `region "Activity"` gains `changed the type to Story`, the workspace feed at `/verify_team/settings/workspace/activity` reads `changed the type of VER-n to Story`, and `smelp-verify sql "select id, type from issue"` stores `story`.
- **Filter by type.** On the board, `getByRole("combobox", { name: "Filter by type" })`, then `option "Bug"`. The URL gains `type=bug`, only cards with a `Bug` icon stay, and `Clear` appears.
- **Change state.** `getByRole("combobox", { name: "State" }).click()`, then `getByRole("option", { name: "In Progress" }).click()`. The combobox reads `In Progress`. Back on the board, the card is in the `In Progress` column and the counts have changed.
- **Delete.** Press `getByRole("button", { name: "Delete work item" })` and confirm in the dialog that opens. You're back on the board and the card is gone.
- **Proof.** Screenshots of the board before and after, `aria("board", page.getByRole("main"))`, and the stored row read back: `page.request.post("/rpc/issues/search", { data: { json: { workspaceId: "verify_team", query: title } } })`, or `smelp-verify sql "select id, title, state from issue where title = '<title>'"`. The `state` column holds a state id, not a name. Join it to `state` to get the name.

## Gotchas

- The `Description` field is a contenteditable rich-text editor. Read what's shown with `innerText()` or roles inside it (`heading`, `checkbox "Not done"`, `table`, `link`), and the stored Markdown with the `issue/find` RPC. `fill()` works on it, but use `page.keyboard.type` to open the `/` menu.
- ProseMirror reads a click's caret a moment after mouseup. Wait about 50ms after clicking into the editor before pressing keys, or the keys land where the caret was.
- Tiptap wraps tables in `div.tableWrapper`, and keeps an empty paragraph after a final table or code block. Click `.tableWrapper + p` to type below a table.
- A read-only member isn't enough to see a project: a workspace member who isn't on the project gets `Access denied`. Add them as a project `guest` (`projectMembers/add`) to get the read-only view, where the description is a `group "Description"` with disabled checkboxes.
- To prove a save waits for an upload, hold the upload with `page.route("**/api/attachments?*", ...)` and count `/rpc/issue/update` requests.
- The board is newest-first by design, so new cards go on top of their column.
- A card's accessible name is `<Type> <KEY> <title>`, such as `Task VER-2 Fix login`, because the type icon is labeled. Its `innerText()` has only the key and title, with a newline between them.
- On the detail page, `combobox "Type"` also matches `combobox "Relation type"`. Pass `exact: true`.
- Dragging uses dnd-kit with pointer sensors, and Playwright's `dragTo` is flaky with it. Prove state changes through the `State` combobox. If you prove dragging, use `page.mouse` down, move in steps, up, and say which path you proved.
- The delete confirmation hasn't been driven yet. Snapshot first and update this file with the real names.
