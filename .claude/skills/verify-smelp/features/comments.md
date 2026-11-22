# Comments and mentions

A member comments on a work item from its Activity section, mentions people by typing `@` and choosing from a menu, and edits or deletes their own comments. A mentioned person gets an inbox notification.

## Sub-features

- `comment-post`: posting adds a comment to the Activity list.
- `comment-mention`: typing `@` opens a listbox of workspace members, and choosing one inserts `@<display name>`.
- `comment-edit`: the author edits their own comment, which then shows as edited next to its time.
- `comment-delete`: the author deletes their own comment.
- `comment-inbox`: a mentioned person sees the mention in their Inbox.
- `comment-outsider`: someone outside the project, reading it because it's public, gets no comment box. A workspace member or admin gets `button "Join project to comment"` in its place, which adds them to the project and shows the box. A workspace guest gets neither.
- `comment-key-link`: a work item key in a comment or description links to the item, if the viewer can read it. Keys in code and unknown keys stay plain.

## How to get to it (user POV)

- Open any work item, then use `textbox "Add a comment"` in `region "Activity"`.
- Open the Inbox from the bell button `Inbox` in the header, next to `Account menu`. It opens a popover, not a page.

## Driving it with smelp-verify

Preconditions:

- The baseline seed, on `VER-1` at `/verify_team/browse/VER-1`.
- `comment-inbox` needs a second member, since you can't mention yourself into your own inbox. Add one through an invite first (see [invites.md](./invites.md)).

Steps:

- **Type with a mention.** Click `getByRole("textbox", { name: "Add a comment" })`, then `page.keyboard.type("Ping @ve")`. `getByRole("listbox", { name: "Add a comment" })` appears with `option "vera"`.
- **Choose the person.** `getByRole("option", { name: "vera" }).click()`, then type ` thanks`. The text reads `Ping @vera thanks`.
- **Post.** `getByRole("button", { name: "Comment" }).click()`. A new `listitem` in Activity shows `vera`, `just now`, the paragraph `Ping @vera thanks`, and the buttons `Edit comment`, `Delete comment`, `Attach files` and `Add reaction`. The comment box empties and `Comment` turns disabled.
- **Edit.** Press `Edit comment`, change the text, and save. The paragraph changes and an edited marker shows next to the time.
- **Delete.** Press `Delete comment` and confirm. The listitem is gone.
- **Inbox.** Sign in as the mentioned second member and press the header button `Inbox` (named `Inbox, N unread` while there are unread items). The popover lists the mention with the work item's title.
- **Key link.** Post ``blocked by VER-1, not `VER-1` and not VER-999``. In `getByRole("group", { name: /^Comment by/ })`, the only link is `getByRole("link", { name: "VER-1" })`, with the item's title and state as its `title`. A plain click opens the item without a page reload. In an editable description, use Ctrl or Cmd and click.
- **Proof.** `aria("activity", page.getByRole("region", { name: "Activity" }))` before and after, and `smelp-verify sql "select body, editedAt from comment where issueId = 'VER-1'"`. For the inbox, `select type, userId, readAt from notification`.

## Gotchas

- Use `keyboard.type` for `@`. `fill()` doesn't fire the key events that open the mention menu.
- `Comment` stays disabled while the box is empty, so a click on it does nothing.
- `comment-outsider` needs the instance and workspace public (`instance/update` `publicAccess`, `workspace/update` `public`) and a second account from an invite. After signing up through `/signup?invite=<token>`, open `/invite/<token>` and press `Accept invite`, or the account isn't a workspace member yet.
- Only the author can edit or delete, and admins can't edit other people's comments. Test that rule with a second account.
- The work item page scrolls inside a panel, so `shot` can miss a comment. Use `locator.screenshot` on the comment.
- Verified so far: post, mention and key links (snapshot names above). The edit and delete confirmation names, and the inbox layout, haven't been driven yet. Snapshot first and update this file.
