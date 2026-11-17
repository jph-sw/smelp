# smelp verification map

This directory is the maintained source for verifying smelp's user-facing behavior. Read this index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- A run started by `smelp-verify launch` from the current checkout. `SMELP_RUN=<id> smelp-verify doctor` passes every check.
- The seed is in place: admin `verify@example.test` / `correct-horse-battery` (display name `vera`), workspace `Verify Team` (`verify_team`), public project `VER` "Verification" with states Backlog, Todo, In Progress and Done, and work item `VER-1` "Seeded work item" in Backlog.
- No SMTP or OIDC settings. Invites and resets show copyable links, and there is no SSO button.
- Never drive an instance this run didn't launch.

## Driving conventions

- Write each recipe as a journey `.mjs` and run it with `SMELP_RUN=<id> smelp-verify browse <journey>`. Add `--fresh` for signed-out recipes.
- Locate by role and accessible name. All names below come from ARIA snapshots of the real app.
- Journeys add data and the seed is never reset. Give every created title a unique suffix (such as `Date.now()`), and don't assume item numbers. A run's earlier journeys may already have used `VER-2`, `VER-3` and so on.
- Read stored state back with `page.request`, `smelp-verify rpc` or `smelp-verify sql`. Never use them to perform the action under test.

## Proof and skip reporting

- Capture the user action and the resulting state: screenshots before and after, plus an ARIA snapshot of the changed region.
- Mutation proof includes a second view after a reload, and the stored row read through `rpc` or `sql`.
- Record the feature file, sub-feature ID and entry point used with every artifact.
- Report an unreachable path with the attempted step and the unmet precondition.
- Don't report a skipped entry point as verified through a different one.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then has exactly four H2 sections, in this order:

1. `Sub-features`: short IDs, one line per behavior.
2. `How to get to it (user POV)`: every entry point a user has.
3. `Driving it with smelp-verify`: starts with `Preconditions:`, then labeled bullets that pair each action with exact locators and the result you can observe.
4. `Gotchas`: traps that waste or invalidate a run.

## Features

- [Work items](./work-items.md): create from the dialog, open, edit, change state, type and priority, filter by type or priority, and find on the board. Proven journey: `journeys/create-work-item.mjs`.
- [Comments and mentions](./comments.md): post, @mention with the trigger menu, edit, delete, and the mentioned person's inbox.
- [Search](./search.md): the header search bar and the board's own search box.
- [Sign in and out](./auth.md): the sign-in form, the redirect when signed out, and Sign Out from the account menu.
- [Workspace invites](./invites.md): create an invite link, accept it as a new person, and revoke one.

Not mapped yet: cycles, modules, project and state settings, archiving, Jira CSV import, `/ceo` instance settings, attachments, reactions, relations and links, and the Activity page. Add a file when you verify one of them.
