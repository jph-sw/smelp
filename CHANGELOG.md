# Changelog

Each release is a git tag. To upgrade, follow [Upgrade](README.md#upgrade) in the README.

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
