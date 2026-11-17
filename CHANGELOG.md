# Changelog

Each release is a git tag. To upgrade, follow [Upgrade](README.md#upgrade) in the README.

## 0.12.0 (2026-11-17)

AI agents sign in to smelp through the browser, with no token to copy.

- **MCP sign-in:** an MCP client like Claude Code or Cursor needs only your smelp address with `/mcp` added. The first time it connects, it opens a browser, where you sign in and allow it to work as you. Each agent you allow shows on your account page under API tokens, marked "Signed in through OAuth", and revoking it signs the agent out right away. Its access lasts an hour at a time and renews by itself while the grant stands. API tokens work as before. Behind a reverse proxy that handles HTTPS, set `APP_URL`, or agents are sent to `http://` addresses.
- **MCP tools:** agents can create workspaces and projects too, with the same checks as the web app.
- **Development in the sidebar:** a work item's GitHub branches, commits and pull requests now show in the right sidebar, under its properties.
- **Fixed:** the window no longer scrolls on a long work item page, which moved the header and sidebar off screen. Only the item's panes scroll.
- **Fixed:** a work item's description uses the full width of its column instead of stopping at about 65 characters per line.
- **Fixed:** creating a project with a key that's taken now says the key is taken, instead of the name.

Upgrading runs one database change automatically, which adds the tables for MCP sign-in. Existing data and API tokens aren't touched. Back up first, as the README describes.

## 0.11.0 (2026-11-17)

Work items show the GitHub branches, commits and pull requests that mention them.

- **GitHub:** a project admin can connect one GitHub repository under the project's settings, then GitHub. smelp shows a webhook address and a secret to add to the repository on GitHub. The secret is shown once, and can be regenerated. After that, any branch, commit or pull request that mentions a work item's key, like `SMELP-12`, shows in a new Development section on that item, and each pull request shows whether it's open, merged or closed. The activity log notes when a pull request is linked and when it merges, under the GitHub user's name. Keys of other projects are ignored, and so are deliveries for archived projects. The address refuses deliveries with a wrong signature, over 1 MB, or too many at once.
- **Activity filter and sort:** a work item's activity can show everything, only comments or only history, newest or oldest first. Newest first is the default, and your choice is remembered in this browser.
- **Fixed:** when the migrations folder is missing, startup now says which path it expected instead of failing with a bare ENOENT error.

Not included yet: moving a work item's state when its pull request merges, and removing a link when a pull request stops mentioning a key.

Upgrading runs one database change automatically, which adds the GitHub tables. Existing data isn't touched. Back up first, as the README describes.

## 0.10.0 (2026-11-16)

Work item types, and comments written and shown as rich text.

- **Work item types:** every work item is a task, bug, story or epic. Its icon shows on board cards, list rows and the work item page, where Type is the first property. Pick it in the New work item dialog, and filter the board by it. Type changes show in the activity feed. New work items are tasks unless you pick another type. AI agents can set it through the MCP server too.
- **Jira import:** Bug, Story, User Story and Epic become their type, and anything else becomes a task. Types that don't map directly, like Improvement or Sub-task, are still noted in the description.
- **Rich-text comments:** comments are written in the same editor as descriptions, and show formatted. `@` picks a person, `/` opens the formatting commands, and Ctrl or Cmd+Enter posts. Links are clickable, and pasted images are attached to the work item. Comments are still stored as Markdown, so an old comment with a stray `*` or `_` may now show as formatting. Comment emails show the Markdown as written.
- **Quieter comments:** each comment is a card, with the reaction button next to edit and delete. Reactions only show once someone has reacted, and "Attach files" only shows while you edit your own comment.
- **Account settings:** the account page is as wide as the other settings pages, with each section's title and description beside its controls.
- **Fixed:** picking List in the project view toggle left Board highlighted too.

Upgrading runs one database change automatically, which sets every existing work item's type. Items whose type isn't one of the four become tasks. Back up first, as the README describes.

## 0.9.0 (2026-11-16)

Public workspaces, so people without an account can follow along.

- **Public instance:** an instance admin can turn on "Public instance" at `/ceo`. It's off by default. Sign-up stays as it is.
- **Public workspaces:** once the instance is public, a workspace admin can turn on "Public workspace" in the workspace settings. Anyone can then read the workspace's public projects without an account: the board, the list, work items with their comments, reactions and attachments, cycles and modules. Private projects stay hidden. The settings card lists the projects that become readable before you turn it on. New projects are public by default, so check the list.
- **Read only for outsiders:** visitors, and signed-in people who aren't members, can't edit, comment or react. They never see email addresses, the activity feed, search, "My work" or settings. The header says "Public · read only" and offers "Sign in". The home page lists the public workspaces, and the sign-in page links to them.
- **Back where you were:** signing in from a page that needs it returns you to that page. This doesn't work yet for single sign-on or sign-up.
- **Fixed:** someone without an account could tell which work items exist from the answer the upload address gave.

Upgrading runs one database change automatically, which adds the public switches. Back up first, as the README describes.

## 0.8.0 (2026-11-16)

Formatted descriptions, and AI agents that can work in smelp as you.

- **Rich-text descriptions:** work item descriptions are edited as formatted text, in place. Typing "/" opens commands for headings, lists, checklists, quotes, code blocks, tables, links and images. Markdown shortcuts like `# ` and `- ` work too. Images can be pasted, dropped or picked, and are attached to the work item. Descriptions are still stored as Markdown. An old description is tidied once when it's next saved: `*` list markers become `-`, and characters like `[` and `*` are escaped.
- **API tokens:** under API tokens on your account page, you can make a token for scripts and agents, with 30 days, 90 days, 1 year or no expiry. It's shown once. It acts as you, with the same access, sent as `Authorization: Bearer <token>`. Tokens can't change your password, linked accounts or tokens, or do instance administration. Revoking one cuts it off right away. Changing your password doesn't revoke tokens.
- **MCP server:** AI agents like Claude Code and Cursor, or any other MCP client, can connect to `/mcp` with an API token. They can search, read, create and update work items, and comment. The account page shows the address, and the README shows how to connect. Set `APP_URL` so the links agents get use your public address.

Upgrading runs one database change automatically, which adds API tokens. Back up first, as the README describes. A browser tab left open across the upgrade may show errors until it's reloaded.

## 0.7.0 (2026-11-15)

Board backgrounds, and a published image, so installing smelp needs only its compose file.

- **Board backgrounds:** project admins can set an image behind a project's board, under Board background in the project settings. It shows faintly behind the columns, below the filter bar. PNG, JPEG and WebP work. The browser shrinks a large photo to fit 1920 by 1080 and the 1 MB limit. Anyone who can see the project sees its background.
- **Published image:** each release is now published at `ghcr.io/jph-sw/smelp`, tagged with its version, like `0.7.0`, and `latest`. Installing needs only `compose.yaml` and a `.env` with `SMELP_VERSION`, with no clone. `SMELP_VERSION` picks the version to run. Building from source with `docker compose up -d --build` still works.
- **nginx guide:** the README's reverse proxy guide uses nginx instead of Caddy.

Upgrading runs one database change automatically, which adds board backgrounds. Back up first, as the README describes.

To upgrade from 0.6.0, keep using your checkout this once: `git fetch --tags`, `git checkout v0.7.0`, then `docker compose up -d --build`. To switch to the published image instead, add `SMELP_VERSION=0.7.0` to `.env` after the checkout, and run `docker compose pull` and `docker compose up -d`. Your data stays in the same `smelp-data` volume either way. From 0.7.0 on, upgrade as the README describes, by downloading the new version's `compose.yaml`.

## 0.6.0 (2026-11-15)

A first design round, search and the inbox in the top bar, and assignee pickers you can search.

- **Design:** a dense, quiet look with a neutral palette, 28 px controls and 13 px text, in light and dark mode. The work item page's side panel is compact rows, and board cards are white with a hairline border. Admins can see every component in its states at `/ceo/ui`.
- **Search in the top bar:** a search bar in the middle of the top bar finds work items across the workspace from every page. Press `/` to jump to it, on keyboard layouts where `/` needs Shift too. The separate Search page is gone.
- **Inbox in the top bar:** the inbox moved from the sidebar into a menu next to your profile button, with the unread count on it.
- **Activity in settings:** the workspace activity feed moved from the sidebar into Workspace Settings, next to Members.
- **Assignee pickers you can search:** picking an assignee on a work item, in the New work item dialog and in the board and list filter now lets you search by name, full name or email, and shows profile pictures. You're listed first. On phones the list opens as a sheet.
- **Better filters on the board and list:** the assignee filter takes several people at once, with Unassigned as one of the choices, like "me and Unassigned". Filters that narrow the view are highlighted, and a count shows how many work items match, like "5 of 27 work items". Links with a single assignee from earlier versions still work.

There are no database changes in this release. Back up before upgrading anyway, as the README describes.

## 0.5.0 (2026-11-13)

Sign in with your own identity provider, confirm email addresses, use smelp on a phone, and a new set of components underneath.

- **Sign-in with OpenID Connect:** one provider, like Google, GitLab, Authentik or Keycloak, next to passwords. Set `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` and `APP_URL` (and optionally `OIDC_BUTTON_LABEL`), and the sign-in and sign-up pages show a button. An existing account links the provider itself, under Account, Single sign-on; nothing is ever linked by email. A sign-in with no linked account makes a new one only on first run, with public sign-up open, or through an invite, and only from a verified email no account uses. Accounts made this way can set a password later. See the README.
- **Email verification:** when public sign-up is open and email is set up, new accounts get a link to confirm their address, and can't create workspaces until they do. Accounts from invites, the first account and every existing account count as confirmed. Admins see unconfirmed accounts at `/ceo` and can confirm them by hand.
- **Phones:** everything you tap is at least 44 px on touch screens, text fields don't zoom in on iOS, dialogs fit the screen, and the board scrolls column by column. Each card has a Move to menu for changing its state on a phone.
- **New components:** the interface moved from shadcn/ui to [ui-sdk](https://ui-sdk.dev), with its plain default look for now. The design comes next. Mentions in comments use ui-sdk's Trigger Menu.

Upgrading runs two database changes automatically: one for email verification and one for provider sign-ins. Back up first, as the README describes.

## 0.4.0 (2026-11-12)

Plan time-boxed work, group it into features, and bring your projects across from Jira.

- **Cycles:** time-boxed iterations per project, with a start and end date. The Cycles tab groups them as current, upcoming and completed, with progress for each. Put a work item in a cycle from its side panel, filter the board and list by cycle, and move a cycle's unfinished items to another cycle in one step. Cycles in one project can't overlap. Project admins create and edit cycles; members put items in them.
- **Modules:** named groups of work items for a feature or epic, with an optional lead and target date, and progress. A work item is in at most one module. Filter the board and list by module. Project admins create and edit modules; members put items in them.
- **Import from Jira:** workspace admins can upload a Jira CSV export under workspace settings. A dry run shows the projects, how Jira statuses map to states and how Jira users match people here, and you can change the mapping before anything is saved. Work items keep their Jira numbers, sub-tasks become sub-items, issue links become relations, and comments come across. Attachments and sprints don't. The import is all or nothing, imported projects are private by default, and the same Jira project can't be imported twice.

Upgrading runs three database changes automatically: tables for cycles, modules and imported Jira projects, plus a cycle and a module column on work items. Back up first, as the README describes.

## 0.3.0 (2026-11-12)

Work items connect to each other and to people: they nest, point at each other, carry files and links, and tell you when something needs you.

- **Sub-items:** break a work item into children in the same project. The parent lists them with a progress bar, and a child shows its parent in the breadcrumb and the side panel. Deleting a parent keeps its children as top-level items.
- **Relations:** mark a work item as blocking, related to or a duplicate of another, in any project of the workspace. Each relation shows on both items, and two items can have one relation between them.
- **Links:** attach web links with an optional title to a work item. Only `http` and `https` links are accepted.
- **Attached files:** attach files to work items and comments, up to 25 MB each (`MAX_ATTACHMENT_MB`). They're stored in an `attachments` folder next to the database, on the data volume in Docker (`ATTACHMENTS_PATH` to move it). Backups now save the files in a `.attachments` folder beside the backup, and restore brings them back.
- **Mentions and inbox:** type `@` in a comment to mention a project member. An Inbox page, with an unread count in the sidebar, lists items you're assigned to, mentioned in, or that get a comment after you created, were assigned or commented on them. One entry per item, marked read when you open it.
- **Notification email:** off by default. Each person can turn it on in their account settings when the install has email set up. It sends at most 20 a person per hour.
- **Reactions:** react to comments with 👍 ❤️ 😄 🎉 😕 👀. Guests can react, as they can comment.

Upgrading runs five database changes automatically: tables for links, relations, reactions, notifications and attached files, and a column for the email setting. Back up first, as the README describes. If you keep backups elsewhere, copy each one's `.attachments` folder with it from now on.

## 0.2.0 (2026-11-11)

Smoother daily use: find anything across the workspace, put finished projects away and see what changed.

- **Search:** a Search page in the sidebar finds work items by title or key across every project you're in. Each project also has a List view beside its board, using the same filters.
- **Archiving projects:** project admins can archive a finished project. It becomes read-only, is hidden from the sidebar, the home page and "My work", and is listed under "Archived" on the projects page. Unarchiving brings it back.
- **Activity:** an Activity page shows what changed in the workspace, newest first and grouped by day. It covers work items, comments, projects, states and members, and only shows what you're allowed to see.
- **Comments:** authors can edit their own comments, and edited comments say so next to their time. Admins can't edit other people's comments.
- **Assignee when creating:** the new work item dialog has an assignee picker.
- **Fixed:** adding or removing a project member was logged as someone joining or leaving the workspace.

Upgrading runs three database changes automatically: a column for comment edits, two for archiving, and an index for the activity page. Back up first, as the README describes.

## 0.1.0 (2026-11-11)

The first release: a small team can install smelp with Docker and track its work in it.

- **Work:** workspaces and projects with guest, member and admin roles. Each project has a board with its own states and drag and drop. Work items have assignees, comments and an activity timeline. "My work" is on the home page, and boards have search and filters.
- **Accounts:** the first account becomes the instance admin. Sign-up is closed after that, and people join through invite links that expire. Users can change their password, name and photo.
- **No mail server needed:** admins create password reset links at `/ceo`, and a server command covers a locked-out admin. Email over any SMTP server is optional.
- **Running it:** a Docker image and Compose file, a backup command that's safe while smelp runs, and restore. `/api/status` checks the database for Docker's health check. Logs show real failures and leave out routine errors.
- **Version:** the running version shows at `/ceo` and in the log when smelp starts.

The image isn't published to a registry. Build it from source as the README describes.
