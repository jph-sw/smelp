---
name: smelp-sync
description: Reconcile the SMELP board on the production smelp instance with what actually happened on GitHub. Finds work items whose PRs merged (or opened, or were closed unmerged) and moves them to the right state, with a comment that cites the PR. Use whenever the user asks to sync, tidy, check or update the smelp board, asks "what's done", "which tickets are merged", "update the states", "is the board up to date", or after a batch of PRs merged or a release.
---

# Sync SMELP with GitHub

The SMELP board (production smelp, project key `SMELP`, states `Backlog → Todo → In Progress → Done`) lags behind GitHub because items are usually left `In Progress` when their PR opens and nobody moves them when it merges. This skill closes that gap. Every state change you make is visible to everyone reading the public board, so only move an item when the evidence is concrete, and leave a comment saying why.

## 1. Collect the board

The MCP tools can't list a whole project. Walk the keys with `mcp__smelp__get_work_item`, SMELP-1, SMELP-2, … in parallel batches of about 10, until you've seen 5 `Not Found` in a row past the highest key that exists. Gaps from deleted items are normal, so don't stop at the first miss.

For each item keep: key, title, type, state, description, and the comments. Skip items already `Done` unless they look wrong (step 3, last row).

## 2. Collect GitHub

From the repo root, run the bundled index:

```sh
.claude/skills/smelp-sync/scripts/pr-index.sh          # recent PRs grouped by the SMELP keys they mention
.claude/skills/smelp-sync/scripts/pr-index.sh 84 91    # state of specific PRs
```

The first form finds PRs whose title, branch or body mention a key (`Fixes [SMELP-5](…)`). Many links live only on the smelp side, in a `PR: https://github.com/jph-sw/smelp/pull/84` comment or the description. Pull every PR URL out of each open item's text and check those numbers with the second form. A PR counts for an item if either side links it.

For an item with no linked PR at all, look for unlinked work. Check `git log origin/main --oneline -n 100` (after `git fetch`) and `gh pr list --state merged --search "<distinctive words>"` for a change matching its title or paths. A match found this way is a candidate, not evidence (step 3).

## 3. Decide each item

| Evidence | Action |
| --- | --- |
| A linked PR into `main` is merged, and nothing in the item says more work remains | Move to `Done`. Comment `Merged in PR #N: <url>`. |
| Several linked PRs, some still open | Leave it. Mention it in the report. |
| A linked PR is open, item is `Backlog` or `Todo` | Move to `In Progress`. Comment `PR open: <url>`. |
| The only linked PRs were closed without merging | Leave the state. Comment once that PR #N closed unmerged, unless a comment already says so. |
| A linked PR merged into a branch other than `main` | Leave it. It isn't shipped until it reaches `main`. |
| Only an unlinked candidate (title or path match, no key) | Don't move it. List it in the report for the user to confirm. |
| Item is `Done` but has no merged PR and no comment explaining it | Don't move it back. List it in the report. |

"Nothing says more work remains" means reading the description and comments, not just matching a key. An item whose PR description or comment says "part 1", "follow-up needed", or whose `Done when` line names something the PR's Scope leaves out stays where it is, and goes in the report.

Before you comment, check the item's comments for one that already cites the same PR, so running the sync twice doesn't repeat itself.

## 4. Apply

Use `mcp__smelp__update_work_item` with only `key` and `state`. Don't touch titles, descriptions or assignees in a sync. Then `mcp__smelp__add_comment`. Run independent items in parallel.

If the user only asked "what's done" or "is the board up to date", report the plan from step 3 first and apply it only after they agree. If they asked you to sync or update, apply directly.

## 5. Report

A short table of what changed, then what needs the user:

| Item | Was | Now | Evidence |
| --- | --- | --- | --- |
| SMELP-12 Split the largest UI files | In Progress | Done | PR #84 merged 2026-11-17 |

Then a list of items you left alone on purpose and why (open PR, unlinked candidate, closed unmerged), with links `https://smelp.philipps.io/smelp/browse/SMELP-<n>`. If nothing changed, say the board matches GitHub in one line.
