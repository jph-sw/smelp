# Search

A member finds work items by title or key across every project they're in from the workspace Search page. Each board also has its own search box that filters the cards in place.

## Sub-features

- `search-hint`: before a query of two or more characters, the page shows a hint.
- `search-match`: a matching query lists results as links with the title, key, project and state.
- `search-open`: a result opens the work item.
- `search-board`: the board's `Search work items` box filters the cards by title or ID.

## How to get to it (user POV)

- The sidebar link `Search` (`/<workspace>/search`).
- The searchbox above a project board, with the placeholder `Search by title or ID`.

## Driving it with smelp-verify

Preconditions:

- The baseline seed: `VER-1 Seeded work item` exists.

Steps:

- **Open.** Press `getByRole("link", { name: "Search" })` in the sidebar. `heading "Search"` appears, and `region "Results"` shows `Type at least two characters to search work items in every project you're in.`
- **Match.** Fill `getByRole("main").getByRole("searchbox", { name: "Search work items" })` with `seeded`. `region "Results"` contains `link "Backlog Seeded work item VER-1 in Verification, Backlog"`, with href `/verify_team/browse/VER-1`.
- **Key match.** Fill it with `VER-1`. The same result appears.
- **No match.** Fill it with `volcano`. There are no result links. Snapshot the empty-state text and add it here.
- **Open result.** Press the result link. The detail page shows `textbox "Title"` holding `Seeded work item`.
- **Board filter.** On `/verify_team/projects/VER`, fill `getByRole("searchbox", { name: "Search work items" })` with `seeded`. Only `VER-1` stays on the board.
- **Proof.** `aria("results", page.getByRole("region", { name: "Results" }))` and a screenshot. Cross-check with `smelp-verify rpc issues/search '{"workspaceId":"verify_team","query":"seeded"}'`.

## Gotchas

- The page and the board both have a searchbox named `Search work items`. Scope to `getByRole("main")`. Only the board's has the placeholder `Search by title or ID`.
- Results update after a debounce. Wait for a result link or the empty text, not a fixed sleep.
- Archived projects are left out of search. To verify archiving, check that their items disappear.
