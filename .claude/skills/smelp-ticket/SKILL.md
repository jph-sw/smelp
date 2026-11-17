---
name: smelp-ticket
description: Turn a feature idea, bug report or chore the user has in mind into a work item in the SMELP project on the production smelp instance (smelp.philipps.io), through the smelp MCP tools. Use whenever the user says "create a ticket/item/issue for…", "add this to smelp", "track this", "put it on the board", "file a bug", describes something smelp should do or a defect they noticed and wants it remembered, or when you discover follow-up work mid-task that should be tracked instead of done now. Not for doing the work (that is smelp-work) or for syncing states with merged PRs (that is smelp-sync).
---

# Create a SMELP work item

smelp's own development is tracked on the production instance, workspace `smelp`, project key `SMELP`. The `mcp__smelp__*` tools act on that instance as the user, so everything you create shows under their name on a board other people can read. Write each item so that a later agent, given only the key, can do the work without asking what was meant.

## Steps

1. **Understand the idea.** Work out what the user wants changed, who notices it, and how they'd know it's done. If the idea is one sentence, that's normal. Fill the gaps from the codebase rather than asking (step 2). Ask the user only about genuine product calls you can't infer, such as which of two behaviors they want.

2. **Ground it in the code.** Spend a few minutes finding where the change lives: the route, component, API procedure or package. Concrete paths and current behavior make the item far more useful than a restated idea, and they often reveal that the "feature" is half built or the "bug" has an obvious cause. Keep it light. You're scoping, not implementing.

3. **Check for duplicates.** `mcp__smelp__search_work_items` with `project: "SMELP"` and two or three distinctive words from the title. Search matches titles only, so try a synonym too. If an open item already covers it, tell the user and offer to add a comment or extend its description instead of creating a second one.

4. **Pick the type.**
   - `bug`: something that works wrongly today.
   - `story`: new user-facing behavior.
   - `task`: internal work with no visible behavior change (refactor, tests, tooling, docs, release).
   - `epic`: only when the user describes something big that will be split into several items.

5. **Write the item.**
   - **Title.** What will be true afterwards, in plain words, under about 70 characters. "Filter and sort a work item's activity", not "Activity improvements". For a bug, describe the wrong behavior: "Board/List toggle highlights both options".
   - **Description** (Markdown), in this order:
     1. The problem or need today, in 1–3 sentences. For a bug, the steps to see it, what happens and what should happen.
     2. What to change, with the file paths you found (`apps/web/src/routes/account.tsx`). Name options if there's a real choice, without deciding product calls for the user.
     3. A final line starting `Done when` that names an observable check: behavior in the app, a test that fails without the change, `bun run lint` passing.

     Keep it short. A reviewer should read it in under a minute. Here is one from the board, to match its tone:

     > Eight `biome-ignore` comments give the placeholder reason `<TODO>`, so the suppressions have no justification.
     >
     > - `packages/auth/src/index.ts` (two places, ~lines 277 and 289): the non-null assertions … can be written without suppressing the rule.
     > - …
     >
     > Done when the `<TODO>` reasons are gone and `bun run lint` still passes.

   - **State.** Leave it out, so it lands in the default `Backlog`. Use `Todo` only when the user says it's next, and `In Progress` only when you're about to start it in this session.
   - **Assignee.** Leave it out unless the user names someone.

6. **Create it** with `mcp__smelp__create_work_item` (`project: "SMELP"`, `title`, `type`, `description`). If the user gave several ideas at once, create one item each, in parallel calls. Split one idea into several items only when its parts can ship independently.

7. **Report back** with the key and its link, `https://smelp.philipps.io/smelp/browse/SMELP-<n>`, the type, and one line on anything you found while scoping that changes the picture (it's already half done, it's bigger than it sounds, there's an open question for the user).

## When you're mid-task

If you're working on something else and spot follow-up work, create the item instead of widening the current change, and mention its key in your reply and in the PR's Scope section. Keep the same quality bar. A vague "clean this up later" item is worse than none.

## If the tools fail

If `mcp__smelp__*` tools are missing, search for them with ToolSearch (`+smelp`) first, since the MCP server may still be connecting. If they're still unavailable or return an auth error, give the user the drafted title, type and description so nothing is lost, and say what failed.
