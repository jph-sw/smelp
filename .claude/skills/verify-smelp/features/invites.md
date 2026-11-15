# Workspace invites

A workspace admin creates a one-time invite link with a role, copies it, and sends it themselves, since there's no mail server. The invited person signs up through it and joins the workspace. Pending invites can be revoked.

## Sub-features

- `invite-create`: `Create invite link` shows the link once, with a `Copy` button, and lists the invite under Pending invites.
- `invite-accept`: a new person opens the link, signs up, and lands in the workspace as a member.
- `invite-revoke`: `Revoke` removes a pending invite, and its link stops working.

## How to get to it (user POV)

- The workspace settings: `/<workspace>/settings/workspace/members`. It's also reachable from the workspace menu (the `Verify Team` button, top left).
- The invited person opens `/invite/<token>`, then goes to the `Sign up` form at `/signup?invite=<token>`.

## Driving it with smelp-verify

Preconditions:

- The baseline seed, signed in as the admin.
- A second journey with `--fresh` for the invited person.

Steps:

- **Create.** `page.goto("/verify_team/settings/workspace/members")`. Optionally fill `textbox "Email (optional)"`, then choose `combobox "Role"` (default `Member`), then press `Create invite link`. `textbox "Send this link to the person you're inviting"` holds `http://localhost:<port>/invite/<token>`, next to `button "Copy"` and the text `It works once and expires in 7 days.` Pending invites lists `Invite link member, expires <date>`, with `button "Revoke"`.
- **Hand over the link.** Read it with `inputValue()` and pass it to the second journey, for example through a file in your scratchpad.
- **Accept.** In a `--fresh` journey, `page.goto(link)`, follow it to sign up, and fill `Email`, `Full name`, `Display name` and `Password`. Press `Sign up`. The new account lands in `Verify Team`. Snapshot the invite page before you sign up and add its names here.
- **Membership.** As the admin, reload Members. The new person is listed, with `combobox "Role for <name>"` reading `Member`.
- **Revoke.** Create another link, press `Revoke`, and confirm. Its line under Pending invites disappears, and opening that link fresh shows an invalid or expired message.
- **Proof.** `aria("members", page.getByRole("main"))` after each step, and `smelp-verify sql "select * from auth_space_member"` and `"select * from auth_space_invite"`.

## Gotchas

- The link is shown only once. Read it from the textbox before you navigate away.
- A link works once. Use a new link for each acceptance attempt.
- Public sign-up is closed after the first account, so `/signup` without `?invite=` shows `Sign-ups are closed`. That's expected, not a failure.
- `--fresh` journeys save no session. To keep acting as the invited person, do everything in the same journey.
- Only the create step has been driven so far. The accept page and the revoke confirmation names are unverified. Snapshot them and update this file.
