# Search

A member finds work items by title or key across every project they're in from the search bar in the middle of the top nav. Each board also has its own search box that filters the cards in place.

## Sub-features

- `search-hint`: under two characters, the dropdown shows a hint.
- `search-match`: a matching query lists results as options with the title, key, project and state.
- `search-empty`: a query with no matches shows `No work items match “<query>”.`
- `search-open`: choosing a result (click, or ArrowDown then Enter) opens the work item and clears the bar.
- `search-shortcut`: pressing `/` anywhere outside a text field focuses the header bar without typing the slash. The bar shows a `/` hint while unfocused, from `md` width up.
- `search-board`: the board's `Search work items` box filters the cards by title or ID.

## How to get to it (user POV)

- The header search bar, on every workspace page.
- The searchbox above a project board, with the placeholder `Search by title or ID`.

## Driving it with smelp-verify

Preconditions:

- The baseline seed: `VER-1 Seeded work item` exists.

Steps:

- **Open.** On `/verify_team`, find `getByRole("banner").getByRole("combobox", { name: "Search work items" })`. Fill it with `s`. The dropdown shows `Type at least two characters, or an ID like WEB-12.`
- **Match.** Fill it with `seeded`. The listbox contains `option "Backlog Seeded work item VER-1 in Verification, Backlog"`.
- **Key match.** Fill it with `VER-1`. The same option appears.
- **No match.** Fill it with `volcano`. There are no options, and the dropdown shows `No work items match “volcano”.`
- **Open result.** Press ArrowDown, then Enter, or click the option. The URL becomes `/verify_team/browse/VER-1`, the detail page shows `textbox "Title"` holding `Seeded work item`, and the bar is empty.
- **Shortcut.** Click the page body and press `/`. The bar is focused and empty, and its `kbd` hint is hidden. `/` typed into `textbox "Add a comment"` or the New work item title stays in that field. The input has `aria-keyshortcuts="/"`.
- **Phone.** At 375px wide, the sidebar trigger, workspace switcher, search bar, Inbox and Account menu all fit without horizontal scroll.
- **Board filter.** On `/verify_team/projects/VER`, fill `getByRole("main").getByRole("searchbox", { name: "Search work items" })` with `seeded`. Only `VER-1` stays on the board.
- **Proof.** `aria("results", page.getByRole("listbox"))` and screenshots at desktop and phone width. Cross-check with `smelp-verify rpc issues/search '{"workspaceId":"verify_team","query":"seeded"}'`.

## Gotchas

- The header bar is a `combobox`. The board's box is a `searchbox` with the same name. Scope to `banner` or `main`.
- Playwright types with a US layout. To check a German QWERTZ slash (Shift+7), dispatch `keydown` with `key: "/"`, `code: "Digit7"`, `shiftKey: true` on the focused element. It should focus the bar, and US `Shift+Slash` (a `?`) should not.
- The `kbd` hint's text wraps `/` in bidi isolation marks (U+2066, U+2069). Strip them before comparing.
- Results update after a debounce. Wait for an option or the empty text, not a fixed sleep.
- Archived projects are left out of search. To verify archiving, check that their items disappear.
