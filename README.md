# smelp

A self-hosted alternative to Jira for small teams. You run it yourself, and all your data stays in one SQLite database on your own server.

smelp is early software. Each release is a git tag, and [CHANGELOG.md](CHANGELOG.md) lists what changed. Back up before upgrading.

## What's in it

- Workspaces and projects, with guest, member and admin roles
- A board for each project, with your own states and drag and drop
- Work items with types (task, bug, story, epic), assignees, sub-items, relations, links, attached files and an activity timeline
- Rich-text descriptions and comments, with @mentions and emoji reactions, and an inbox for what needs you
- "My work" on the home page, workspace-wide search, a list view and an activity feed
- Cycles to plan time-boxed work, and modules to group work into features
- Archiving finished projects
- Connecting a GitHub repository, so branches, commits and pull requests that mention a work item show on it
- Importing projects from a Jira CSV export
- Invite links, closed sign-up and password reset that work without a mail server
- An optional public mode, where anyone can read the public projects of public workspaces without an account
- Optional sign-in with OpenID Connect (Google, GitLab, Authentik, Keycloak and others)
- Optional email over any SMTP server, with email verification when public sign-up is open
- An MCP server, so AI agents can find, file and update work items as you
- Works on phones

The look is plain for now: the components are built on [ui-sdk](https://ui-sdk.dev) with its default styles, and a proper design is next.

## Install

You need Docker with Compose 2.24 or newer. Each release is published as an image at `ghcr.io/jph-sw/smelp`. You only need its compose file. Make a folder for it, download the file, pick a version and start it. Use the newest version from [CHANGELOG.md](CHANGELOG.md) in place of `v0.11.0`.

```sh
mkdir smelp && cd smelp
curl -fsSLO https://raw.githubusercontent.com/jph-sw/smelp/v0.11.0/compose.yaml
echo SMELP_VERSION=0.11.0 >> .env
docker compose pull
docker compose up -d
```

Run the other `docker compose` commands in this README from that folder. Your data isn't in it, it's in the `smelp-data` Docker volume.

To build from source instead, clone the repository at the release tag with `git clone --branch v0.11.0 https://github.com/jph-sw/smelp.git`, and run `docker compose up -d --build` in the checkout.

Open <http://localhost:3000> and create your account. The first account becomes the instance admin. After that, people join through invite links from a workspace's member settings, unless you open public sign-up at `/ceo`.

### Trying it from another computer

Browsers refuse the login cookie over plain HTTP, except on localhost, so signing in fails and the sign-in page tells you so. To try smelp on a local network before setting up HTTPS:

```sh
echo SECURE_COOKIES=false >> .env
docker compose up -d
```

Take it out of `.env` again once you have HTTPS.

## HTTPS with a reverse proxy

Anything reachable from the internet should be behind HTTPS. With [nginx](https://nginx.org) on the same server, put this in `/etc/nginx/conf.d/smelp.conf`:

```nginx
server {
	listen 80;
	server_name smelp.example.com;

	# Attached files can be 25 MB, and Jira imports 10 MB.
	# Raise this if you raise MAX_ATTACHMENT_MB.
	client_max_body_size 30m;

	location / {
		proxy_pass http://127.0.0.1:3000;
		proxy_set_header Host $host;
		proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto $scheme;
	}
}
```

Then get a certificate with [Certbot](https://certbot.eff.org). It adds HTTPS to this config and renews the certificate for you:

```sh
sudo certbot --nginx -d smelp.example.com
```

Then set these in `.env` and run `docker compose up -d`:

```sh
# Only the proxy can reach smelp now.
SMELP_PORT=127.0.0.1:3000
# Rate limits see each person's address, not the proxy's.
TRUST_PROXY=true
```

Only use `TRUST_PROXY` behind a proxy that adds to `X-Forwarded-For`, as the nginx config above does, and only when smelp can't be reached directly. Otherwise anyone can fake their address to get around sign-in rate limits.

## Settings

All of these are optional. Put them in `.env`, which [`.env.example`](.env.example) has a starting point for, and run `docker compose up -d` to apply them.

| Setting | What it does |
| --- | --- |
| `SMELP_VERSION` | The image version to run, like `0.11.0`. Defaults to `latest`, the newest release. |
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

### Sign in with OpenID Connect

One OpenID Connect provider (Google, GitLab, Authentik, Keycloak and so on) can be added next to passwords. It turns on when `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` and `APP_URL` are all set, and the sign-in and sign-up pages then show a button. Without them, nothing changes.

| Setting | What it does |
| --- | --- |
| `OIDC_ISSUER_URL` | The provider's issuer address. smelp reads `/.well-known/openid-configuration` from it. It must be `https://`, except on this machine. |
| `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | The client you registered with the provider |
| `APP_URL` | Public address of this install, shared with email |
| `OIDC_BUTTON_LABEL` | Text of the button. Defaults to `Sign in with SSO`. |

Register `APP_URL/api/auth/oidc/callback` as the redirect URI with your provider. smelp asks for the `openid email profile` scopes and uses the authorization code flow with PKCE.

- **Existing accounts are linked by the person, never by email.** Someone who already has an account signs in with their password, opens Account, then Single sign-on, and presses "Link" with the provider's name. They go through the provider and come back with it attached to the account they were signed in to. The provider's email doesn't have to match, and nothing is guessed from it. From then on that sign-in finds the account by the provider's own id.
- **Signing in without a link:** a person with no linked account gets a new one only if public sign-up is open at `/ceo`, or they came through an invite link, or it's the first account on a new install (which becomes the admin). The provider must report a verified email (`email_verified` set to `true`) that no account uses. In every other case, including an email that already belongs to an account, they see the same message telling them to sign in with their password and link the provider, so it never says whether an email has an account.
- **Unlinking:** the account settings show the linked provider. It can be unlinked only by someone who also has a password. People whose account was made through the provider have none yet, and can set one there or through a password reset.
- Logins in progress are kept in memory, like the rate limits, so a restart cancels any that are half done.
- Changing `OIDC_ISSUER_URL` to a different provider starts fresh. Existing links to the old one stop matching, and their owners can sign in with their password and link the new provider.

## Using smelp from AI agents

Agents like Claude Code and Cursor, or any other MCP client, can work in smelp as you: search, read, create and update work items, and comment. They see and change only what you can.

Create a token on your account page under API tokens. The same section shows the MCP endpoint, which is your smelp address with `/mcp` added. In Claude Code:

```sh
claude mcp add --transport http smelp https://smelp.example.com/mcp --header "Authorization: Bearer smelp_..."
```

Other clients take a URL and headers, usually in a JSON file shaped like this:

```json
{
  "mcpServers": {
    "smelp": {
      "url": "https://smelp.example.com/mcp",
      "headers": { "Authorization": "Bearer smelp_..." }
    }
  }
}
```

Agents name work items by their key, like `ABC-12`, and states and people by name. Set `APP_URL` so the links to work items they get use your public address. Revoking the token cuts the agent off right away.

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

Back up, set `SMELP_VERSION` in `.env` to the new version, download that version's compose file, then pull it and restart:

```sh
docker compose exec smelp bun run backup
curl -fsSLO https://raw.githubusercontent.com/jph-sw/smelp/v0.11.0/compose.yaml
docker compose pull
docker compose up -d
```

Replace `v0.11.0` with the version you're upgrading to, and read its entry in [CHANGELOG.md](CHANGELOG.md) first. Each release is tested by upgrading a database from the release before it. You can skip versions.

If you build from source, check out the new version and build it instead of pulling:

```sh
docker compose exec smelp bun run backup
git fetch --tags
git checkout v0.11.0
docker compose up -d --build
```

Database changes run automatically when smelp starts, and they can't be undone. To go back, set the older version again, or check it out, and restore the backup you just took. `/ceo` shows which version is running.

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
2. Run `bun run test:upgrade v0.11.0`, using the previous release's tag. It builds that version and this one in Docker, adds data to the old one, upgrades the same volume and checks nothing was lost. Add `--bun` to run them without Docker.
3. Merge to `main`, then tag that commit and publish the release notes:

```sh
git tag -a v0.11.0 -m "smelp 0.11.0"
git push origin v0.11.0
awk '/^## 0.11.0/{found=1; next} /^## /{found=0} found' CHANGELOG.md > notes.md
gh release create v0.11.0 --title "smelp 0.11.0" --notes-file notes.md
```

4. Pushing the tag runs the Release workflow, which publishes the image as `0.11.0`, `0.11` and `latest`. Run `gh run watch` and pick it to follow it until it's done. To publish an existing tag again, run `gh workflow run release.yml -f tag=v0.11.0`. That only moves `latest` when the tag is the newest release.

## License

[AGPL-3.0](LICENSE). If you run a modified version for others over a network, you have to offer them its source.
