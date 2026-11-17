---
name: smelp-work
description: Take a SMELP work item from the production smelp board and carry it through to an open PR in poteto-mode style (restate the goal, pick the pstack playbook, delegate, verify on the real surface, small commits, clean PR), with smelp's own conventions layered on top and the ticket kept current. Use whenever the user hands you a ticket key or link ("do SMELP-12", "work on smelp.philipps.io/smelp/browse/SMELP-10", "pick up the next ticket", "implement this item"), even if they don't mention poteto-mode.
---

# Work a SMELP ticket

You get a work item from the SMELP project on production smelp and deliver it as a reviewed-quality PR on `jph-sw/smelp`. The method is pstack's **poteto-mode**. This skill adds what poteto-mode doesn't know: where the ticket lives, how smelp verifies changes, how smelp's PRs and branches look, and how the ticket is kept honest along the way.

## 0. Load poteto-mode

poteto-mode has `disable-model-invocation`, so the Skill tool won't load it. Read it from the pstack plugin instead:

```sh
P=$(ls -d ~/.claude/plugins/cache/cursor-plugins/pstack/*/ | sort -V | tail -1)
# then Read: $P/docs/harness/claude-code.md and $P/skills/poteto-mode/SKILL.md
```

Read the Claude Code adapter first (it maps Cursor names like `Task` and `poteto-agent` to `Agent` and `pstack:poteto-agent`), then poteto-mode in full, then the playbook it routes you to under `$P/skills/poteto-mode/playbooks/`, and `opening-a-pr.md`. Model choices come from `~/.claude/rules/pstack-models.md`, which is already in context. Follow poteto-mode from here on. The sections below are additions and overrides, and win where they conflict.

If the plugin isn't installed, say so once and carry on with the same shape by hand: restate the goal, trace the code, smallest change, verify for real, small commits, PR.

## 1. Read the ticket

`mcp__smelp__get_work_item` with the key (pull it out of a URL if you got one). Read the description, every comment and the relations. Then check where it stands:

- **Already `Done`**, or a comment links a merged PR: tell the user and stop, unless they say the work is incomplete.
- **A comment links an open PR or branch**: this is a pickup, not a fresh start. Use poteto-mode's Session pickup playbook on that branch.
- **The description is too thin to act on**: ground it in the code first. If a real product question remains, ask it. Otherwise make the call, and write it into the ticket in step 2.

The ticket's `Done when` line is the acceptance check. Your first message restates the user's goal (poteto-mode's first trigger) in terms of that line and the smallest change you expect to meet it.

## 2. Claim it

- Move it to `In Progress` with `mcp__smelp__update_work_item` (`key`, `state` only).
- If you decided something the description left open, or the scope turned out different, add a short comment saying what and why. Edit the description itself only to fix something wrong in it, because `description` replaces the whole text.

## 3. Pick the playbook

Route by what the work is, using the ticket type as a hint:

| Ticket | Playbook |
| --- | --- |
| `bug` | Bug fix |
| `story` | Feature |
| `task` that changes structure only | Refactoring |
| `task` that adds tests, tooling or docs | Feature, scaled down |
| `epic` | Don't implement it whole. Propose child items with the smelp-ticket skill and ask which to start. |

## 4. Branch

Work in a fresh worktree off `origin/main`, never on whatever branch the main checkout has open:

```sh
git fetch origin
git worktree add ../smelp-<slug> -b <type>/<slug> origin/main
cd ../smelp-<slug> && bun install
```

`<type>` is the Conventional Commits type that will lead the PR title (`feat`, `fix`, `refactor`, `test`, `docs`, `chore`). `<slug>` is a few words from the title: `fix/migrations-folder-missing`, `feat/activity-filter-sort`.

## 5. smelp specifics while you build

- **Web UI.** `apps/web` is built on ui-sdk. Before touching its components, follow the ui-sdk skill and read `apps/web/node_modules/@ui-sdk/react/docs/llms.txt`, as `AGENTS.md` says. Put that in every delegate's brief that touches `apps/web`.
- **Database.** A schema change needs a migration from `bun run migrate:new`. Releases run `bun run test:upgrade <previous tag>`, so keep existing data upgradeable.
- **MCP tools.** If you change what an oRPC procedure accepts or returns, check `apps/api/src/lib/mcp.ts` and its tool descriptions still tell agents the truth.
- **Changelog.** Don't edit `CHANGELOG.md`. Release PRs write it.
- **Scope creep.** Follow-up work you spot becomes a new item via the smelp-ticket skill, named in the PR's Scope section, not part of this diff.

## 6. Verify

poteto-mode's "Prove It Works" on smelp means all of:

```sh
bun test && bun run lint && bun run typecheck
```

plus, for any change a user can see in `apps/web` or reach through `apps/api`, the **verify-smelp** skill: a throwaway instance driven in headless Chromium, with the screenshots or ARIA snapshots that show the `Done when` line holds. Unit tests alone don't prove a UI change. If verify-smelp can't reach something, say exactly what wasn't verified.

## 7. Open the PR

Follow poteto-mode's Opening a PR, with these smelp additions:

- The body's first line is `Fixes [SMELP-<n>](https://smelp.philipps.io/smelp/browse/SMELP-<n>).` (use `Part of` instead of `Fixes` when the PR covers only some of the ticket). The smelp-sync skill relies on this link to close the ticket when the PR merges.
- Then poteto-mode's sections: `## Why` (opening with the user's goal), `## What changed`, `## Scope`, `## Blast Radius`, `## Verification`.
- Skills poteto-mode names that aren't installed here, such as `/deslop` and `/no-comments` from cursor-team-kit, get applied by intent (strip slop, drop comments that don't explain a non-obvious why) and noted in one line.
- `git push -u origin <branch>`, then `gh pr create --base main` (ready, not draft). Don't merge it unless the user asks.

## 8. Update the ticket

Comment on the item with the PR and what proves it, in the style the board already uses:

> PR: https://github.com/jph-sw/smelp/pull/84. `account.tsx` went from 699 to 73 lines and `issue-activity.tsx` from 688 to 248, with code moves only. Lint, typecheck, the web tests and a verify-smelp journey (account sections and creating a token; comment, react, edit, reload) all pass.

Leave the state at `In Progress`. It moves to `Done` when the PR merges, through the smelp-sync skill, or right away if the user merges in this session and asks.

## Reply

poteto-mode's reply rules apply. Also include the ticket link, its state now, the PR URL, and any new items you created.
