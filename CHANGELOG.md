# Changelog

Each release is a git tag. To upgrade, follow [Upgrade](README.md#upgrade) in the README.

## 0.1.0 (2026-11-11)

The first release: a small team can install smelp with Docker and track its work in it.

- **Work:** workspaces and projects with guest, member and admin roles. Each project has a board with its own states and drag and drop. Work items have assignees, comments and an activity timeline. "My work" is on the home page, and boards have search and filters.
- **Accounts:** the first account becomes the instance admin. Sign-up is closed after that, and people join through invite links that expire. Users can change their password, name and photo.
- **No mail server needed:** admins create password reset links at `/ceo`, and a server command covers a locked-out admin. Email over any SMTP server is optional.
- **Running it:** a Docker image and Compose file, a backup command that's safe while smelp runs, and restore. `/api/status` checks the database for Docker's health check. Logs show real failures and leave out routine errors.
- **Version:** the running version shows at `/ceo` and in the log when smelp starts.

The image isn't published to a registry. Build it from source as the README describes.
