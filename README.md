# smelp

A self-hosted alternative to Jira for small teams. You run it yourself, and all your data stays in one SQLite database on your own server.

smelp is early software. Each release is a git tag, and [CHANGELOG.md](CHANGELOG.md) lists what changed. Back up before upgrading.

## What's in it

- Workspaces and projects, with guest, member and admin roles
- A board for each project, with your own states and drag and drop
- Work items with assignees, sub-items, relations, links, attached files and an activity timeline
- Comments with @mentions and emoji reactions, and an inbox for what needs you
- "My work" on the home page, workspace-wide search, a list view and an activity feed
- Cycles to plan time-boxed work, and modules to group work into features
- Archiving finished projects
- Importing projects from a Jira CSV export
- Invite links, closed sign-up and password reset that work without a mail server
- Optional email over any SMTP server

Not there yet: signing in with another provider (OpenID Connect), email verification, and a full pass for phones.

## Install

You need Docker with Compose 2.24 or newer. There's no published image, so this builds from source. Use the newest version from [CHANGELOG.md](CHANGELOG.md) in place of `v0.4.0`.

```sh
git clone --branch v0.4.0 https://github.com/jph-sw/smelp.git
cd smelp
docker compose up -d --build
```

Open <http://localhost:3000> and create your account. The first account becomes the instance admin. After that, people join through invite links from a workspace's member settings, unless you open public sign-up at `/ceo`.

### Trying it from another computer

Browsers refuse the login cookie over plain HTTP, except on localhost, so signing in fails and the sign-in page tells you so. To try smelp on a local network before setting up HTTPS:

```sh
cp .env.example .env
```

Then set `SECURE_COOKIES=false` in `.env`, and run `docker compose up -d`. Remove it again once you have HTTPS.

## HTTPS with a reverse proxy

Anything reachable from the internet should be behind HTTPS. With [Caddy](https://caddyserver.com) on the same server, this is the whole config, and it gets the certificate for you:

```
smelp.example.com {
	reverse_proxy localhost:3000
}
```

Then set these in `.env` and run `docker compose up -d`:

```sh
# Only the proxy can reach smelp now.
SMELP_PORT=127.0.0.1:3000
# Rate limits see each person's address, not the proxy's.
TRUST_PROXY=true
```

Only use `TRUST_PROXY` behind a proxy that adds to `X-Forwarded-For`, as Caddy and nginx can, and only when smelp can't be reached directly. Otherwise anyone can fake their address to get around sign-in rate limits.

## Settings

All of these are optional. Put them in `.env`, which `.env.example` has a starting point for, and run `docker compose up -d` to apply them.

| Setting | What it does |
| --- | --- |
| `SMELP_PORT` | Port on this machine, optionally with an address. Defaults to `3000`. |
| `SECURE_COOKIES` | `false` allows signing in over plain HTTP. |
| `TRUST_PROXY` | `true` when behind a reverse proxy. See above. |
| `MAX_ATTACHMENT_MB` | Largest file that can be attached to a work item or comment, in megabytes. Defaults to `25`. |
| `ATTACHMENTS_PATH` | Where attached files are stored. Defaults to an `attachments` folder next to the database, which is on the `smelp-data` volume in Docker. Keep it on a persistent volume. |
| `CORS_ORIGINS` | Comma-separated origins allowed to call the API from another site. The web app doesn't need this. |

### Email

Email turns on when `SMTP_HOST`, `SMTP_FROM` and `APP_URL` are all set. Invites and admin-created reset links are then emailed, and sign-in gains "Forgot your password?". Without email, you copy those links and send them yourself. People can also opt in to email for their inbox notifications in their account settings; it is off by default. When public sign-up is open, new accounts get a link to confirm their email address (it works once and expires in 24 hours). Until they confirm, they can sign in and join workspaces by invite, but not create one. Accounts that join through an invite link, the first account and accounts that existed before count as confirmed, and an instance admin can mark anyone as confirmed at `/ceo`.

| Setting | What it does |
| --- | --- |
| `SMTP_HOST` | Mail server |
| `SMTP_FROM` | Sender, such as `smelp <smelp@example.com>` |
| `APP_URL` | Public address of this install, used in emailed links |
| `SMTP_PORT` | Defaults to `587` |
| `SMTP_USER`, `SMTP_PASSWORD` | Login, if the server needs one |
| `SMTP_SECURE` | `true` for TLS from the first byte. Defaults to on for port `465`. |
| `SMTP_REQUIRE_TLS` | `false` allows an unencrypted connection, for a local relay |

To check your settings, use **Send test email** at `/ceo`. Self-signed certificates on mail servers are rejected.

## Backup

Your data is a SQLite database, which includes photos, and a folder of attached files (`/data/attachments`), both on the `smelp-data` Docker volume. This is safe while smelp is running:

```sh
docker compose exec smelp bun run backup
```

It prints the backup's path, under `/data/backups`. If anything is attached, the files are saved in a folder beside it with the same name plus `.attachments`. **That's on the same disk as your data, so copy both somewhere else:**

```sh
docker compose cp smelp:/data/backups/smelp-2026-01-31T03-00-00-000Z.sqlite .
docker compose cp smelp:/data/backups/smelp-2026-01-31T03-00-00-000Z.sqlite.attachments .
```

Keep backups private, because they contain password hashes. To back up nightly from cron, use `-T`, since cron has no terminal:

```
0 3 * * * cd /path/to/smelp && docker compose exec -T smelp bun run backup
```

Old backups aren't removed automatically. Don't copy the database file directly while smelp is running, because the copy can be damaged.

## Restore

Stop smelp, restore, then start it again:

```sh
docker compose stop
docker compose run --rm smelp bun run restore /data/backups/smelp-2026-01-31T03-00-00-000Z.sqlite
docker compose start
```

If the backup is outside the container, such as on a new server, put it on the volume first:

```sh
docker compose run --rm -T smelp sh -c 'cat > /data/incoming.sqlite' < smelp-2026-01-31T03-00-00-000Z.sqlite
tar -C smelp-2026-01-31T03-00-00-000Z.sqlite.attachments -c . | docker compose run --rm -T smelp sh -c 'mkdir /data/incoming.sqlite.attachments && tar -x -C /data/incoming.sqlite.attachments'
docker compose run --rm smelp bun run restore /data/incoming.sqlite
docker compose up -d
```

If the backup has a `.attachments` folder beside it, restore brings those files back too. Backups from before attachments existed have none, so your current files, which that backup no longer refers to, are set aside in the same `.before-restore-…` folder rather than deleted. If you move a backup, move the folder with it, and restore warns if it's missing.

Your current database is set aside in `/data/backups`, and your current attached files in a hidden `.before-restore-…` folder inside the attachments folder, not deleted. Because that folder is used for the swap, `ATTACHMENTS_PATH` can safely be a mount point of its own. If any step fails, the restore is undone and says so. Files that no backup or row refers to are removed on start, once they're an hour old, so the set-aside folder is left alone but stray files from a crash are cleaned up. Restore refuses damaged files, and backups from a newer version of smelp. An older backup is fine, because it's brought up to date when smelp starts. If smelp crashed, restore waits 30 seconds after the crash before it will run.

## Upgrade

```sh
docker compose exec smelp bun run backup
git fetch --tags
git checkout v0.4.0
docker compose up -d --build
```

Replace `v0.4.0` with the version you're upgrading to, and read its entry in [CHANGELOG.md](CHANGELOG.md) first. Each release is tested by upgrading a database from the release before it. You can skip versions.

Database changes run automatically when smelp starts, and they can't be undone. To go back, check out the older version and restore the backup you just took. `/ceo` shows which version is running.

## Logs and health

If something goes wrong, the logs show what failed. Routine errors, like a wrong password or an expired session, aren't logged.

```sh
docker compose logs smelp
```

`/api/status` checks that the database can be read. It returns `200` when it can and `503` when it can't, and Docker uses it to mark the container unhealthy. Point an uptime monitor at it if you use one.

## If you're locked out

An instance admin can create a password reset link for anyone at `/ceo`. If you're the only admin and you've lost your password:

```sh
docker compose exec smelp bun run admin:reset-link you@example.com
```

Add what it prints to your smelp address. It works once, for 24 hours.

## Stopping and removing

`docker compose down` stops smelp and keeps your data. **`docker compose down -v` deletes the volume, and with it all your data and any backups stored there.**

## Development

You need [Bun](https://bun.com) 1.3.10.

```sh
bun install
bun run dev
```

Open <http://localhost:5173>. The API runs on port 3000 and keeps its data in `./database.sqlite`.

| Command | What it does |
| --- | --- |
| `bun test` | Runs the API tests, on a temporary database |
| `bun run chore:check` | Formats and lints with Biome |
| `bun run typecheck` | Checks types in the API and the web app |
| `bun run migrate:new <name>` | Creates a new migration in `migrations/` |
| `bun run build:web && bun run start` | Runs the production build without Docker |

Without Docker, `PORT`, `DATABASE_PATH` and `WEB_DIST` set the port, the database file and the built web app's location, and `ATTACHMENTS_PATH` the attached files' folder.

### Releasing

1. Set the new version in `package.json`, and move the changes under it in `CHANGELOG.md`, with the date.
2. Run `bun run test:upgrade v0.3.0`, using the previous release's tag. It builds that version and this one in Docker, adds data to the old one, upgrades the same volume and checks nothing was lost. Add `--bun` to run them without Docker.
3. Merge to `main`, then tag that commit and publish the release notes:

```sh
git tag -a v0.4.0 -m "smelp 0.4.0"
git push origin v0.4.0
awk '/^## 0.4.0/{found=1; next} /^## /{found=0} found' CHANGELOG.md > notes.md
gh release create v0.4.0 --title "smelp 0.4.0" --notes-file notes.md
```

## License

[AGPL-3.0](LICENSE). If you run a modified version for others over a network, you have to offer them its source.
