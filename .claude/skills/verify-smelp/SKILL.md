---
name: verify-smelp
description: Launch a disposable smelp instance (Bun API serving the built React web app) and drive it in headless Chromium the way a user does, to prove a web UI or API change works end to end with screenshots, ARIA snapshots, Playwright traces and stored-data checks. Use after changing apps/web, apps/api or packages/*, when asked to verify, demo, screenshot or "check it actually works" in smelp, or before claiming a user-facing fix is done.
---

# Verify smelp

smelp's user surface is the web app, served by the API from one Bun process. This skill starts a **separate, throwaway instance** of it from the current checkout, seeds it through the real API, and drives it with Playwright from Node. It never touches `./database.sqlite`, port 3000/5173, or a dev server the user has open.

Everything goes through one helper. Use its full path, or put it on `PATH`:

```sh
V=.claude/skills/verify-smelp/scripts/smelp-verify   # from the repo root
$V                                                   # help
```

Your shell state doesn't carry between tool calls, so prefix every command with the run id: `SMELP_RUN=<id> $V doctor`.

## Launch

```sh
$V launch            # prints SMELP_RUN=<id> on its last line, progress on stderr
```

It takes a few seconds. In order, it:

1. Installs `playwright-core@1.60.0` into `~/.local/state/verify-smelp/tools` (outside the repo). That version matches the Chromium already in `~/.cache/ms-playwright`. On Arch, Playwright prints `BEWARE: your OS is not officially supported`, which is harmless.
2. Runs `bun install` only if `node_modules` is missing.
3. Builds `apps/web` with Vite into the run's own `web/` folder, so it reflects the working tree, uncommitted edits included.
4. Starts `bun apps/api/src/index.ts` with `NODE_ENV=production` and its own free port, `DATABASE_PATH`, `ATTACHMENTS_PATH` and `WEB_DIST`. Migrations run on start, from an empty database.
5. Waits until `/api/status` answers 200 **and** `/signin` serves the app shell.
6. Seeds through the real RPC API (`scripts/seed.ts`):
   - the first account, `verify@example.test` / `correct-horse-battery` (display name `vera`), which becomes the instance admin
   - workspace `Verify Team` (id `verify_team`)
   - public project `VER` named `Verification`, with the default states Backlog, Todo, In Progress and Done
   - work item `VER-1`, "Seeded work item", in Backlog

   It saves the admin's session cookie as the browser session.

Ready means `launch` printed `SMELP_RUN=` and exited 0. Two runs can go side by side, since each has its own port and data.

To set a fixed id, run `SMELP_RUN=my-id $V launch`. It refuses an id that already exists.

## Doctor

```sh
SMELP_RUN=<id> $V doctor
```

This is read-only. It checks that:

- the run's process is alive and owns the run's port
- `/api/status` answers 200 and the web app is served
- the process uses this run's database file
- the seeded admin session still works

It also prints the version and git revision the run was built from (`-dirty` means there were uncommitted tracked changes). Run it first whenever anything looks off. Never drive a smelp you didn't launch: check `$V list` instead of guessing a port.

## Drive

A **journey** is an ES module (`.mjs`) that drives the page with Playwright locators:

```sh
SMELP_RUN=<id> $V browse .claude/skills/verify-smelp/journeys/create-work-item.mjs
SMELP_RUN=<id> $V browse path/to/journey.mjs --fresh   # signed out, no session
```

The default export gets `{ page, base, seed, step, shot, aria, expect, evidenceDir }`:

- `page` already has `baseURL` set, so `page.goto("/verify_team")` works. It's signed in as the seeded admin unless you pass `--fresh`. Session changes (sign-out, a new sign-in) are saved back for the next journey.
- `seed` is the seeded data: `workspaceId`, `projectId`, `projectName`, `issue.id`, `issue.title`, `account.email`, `account.password`, `states`.
- `step(text)` logs a step. `expect(cond, text)` asserts and logs a ✓, and a failed check ends the journey.
- `shot(label)` saves a numbered full-page PNG. `aria(label, locator?)` saves an ARIA snapshot (YAML), of the body by default.
- `page.request.post("/rpc/<procedure>", { data: { json: {...} } })` reads stored state with the browser's session, which proves side effects.

Copy `journeys/create-work-item.mjs` as a template. Keep one-off journeys in your scratchpad. Add a journey to `journeys/` only when it covers a feature in the map.

Find elements by ARIA role and accessible name (`getByRole("button", { name: "New work item" })`). The app is built on ui-sdk and labels nearly everything. If you don't know a handle, take an `aria(...)` snapshot of the page first and read it. Don't guess CSS classes.

Two more helpers prove side effects outside the browser:

```sh
SMELP_RUN=<id> $V rpc issues/search '{"workspaceId":"verify_team","query":"seeded"}'   # as the admin
SMELP_RUN=<id> $V sql "select id, title, state from issue order by createdAt desc limit 5"     # read-only
SMELP_RUN=<id> $V logs                                                              # server log
```

The API's procedures are in `apps/api/src/router.ts`. Tables include `issue`, `comment`, `project`, `state`, `workspace`, `auth_user`, `auth_space_invite`, `notification` and `activity_logs`.

## Evidence

Each `browse` writes to `~/.local/state/verify-smelp/evidence/<run>/<journey-name>/`:

- `journey.log`: the steps, the checks, console errors, page errors, any HTTP 5xx, and PASS or FAIL
- `NN-<label>.png` screenshots and `<label>.aria.yml` snapshots. A failure adds `failure.png` and `failure.aria.yml`.
- `trace.zip`, the Playwright trace with DOM snapshots of every action. Open it with `npx playwright-core@1.60.0 show-trace <file>`.

`stop` copies `server.log` there too.

Proof standards:

- **Use the real user path.** Click what a user clicks. Use `rpc`, `sql` and `page.request` only to *read back* the result, or for setup that isn't under test (the seed). Never use them to perform the action you're proving.
- **Capture the action and the result.** Take a screenshot before and after, plus an ARIA snapshot of the changed region, not only the final screen.
- **Check persistence.** Reload or reopen and check again. Confirm the stored row with `rpc` or `sql` when the change writes data (items, comments, invites, notifications).
- **Report entry points honestly.** If the feature map lists several entry points and you drove one, say which one. Don't call the others verified.
- **Treat email and OIDC as off.** The instance has no SMTP or OIDC settings, so the app shows copyable links instead of sending mail. To verify mail or SSO behavior, say it needs a real server or provider, and don't fake one.

When you report, give the run id, the journey's PASS or FAIL line, and the paths to the screenshots and trace.

## Cleanup

```sh
SMELP_RUN=<id> $V stop
```

This sends SIGTERM to the run's own PID (then SIGKILL after 10s), copies `server.log` into the evidence folder, and deletes `runs/<id>` (database, attachments, web build). Evidence under `evidence/<id>/` is kept. Delete it by hand when it's no longer needed.

Never `pkill bun`, since the user's dev server is a bun process too. If a run's folder is gone but its process isn't, find it with `ss -ltnp` on the run's port and kill that PID only.

Stop every run you launched before you finish, including after a failed attempt.

## Feature map

`features/README.md` indexes the user-facing features with a recipe for each. Read the matching file before you verify a change to that area. Keep it current as the app changes (`/pstack:maintain-verification-skill`).
